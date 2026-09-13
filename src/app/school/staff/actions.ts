"use server";

import { hash } from "bcryptjs";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import type { TenantDb } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";
import { roleKeyForName, isTeachingRoleKey, isSchoolStaffAccount } from "@/lib/authorization";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/default-rbac";
import { staffRolePermissionKeys } from "@/lib/staff-role-presets";

export type StaffCreateResult = { ok: true; name: string; status: "active"; message: string } | { ok: false; message: string };
export type StaffDetailsValidation = { ok: true } | { ok: false; message: string };
export type StaffTeachingUpdateResult = { ok: true; count: number; message: string } | { ok: false; message: string };

type StaffSession = { userId: string; schoolId: string };
type AssignmentPair = { classId: string; subjectId: string; className: string; subjectName: string };
type OfferingRow = AssignmentPair;

const teachingAssignmentsSchema = z.array(z.object({
  classId: z.string().trim().min(1),
  subjectIds: z.array(z.string().trim().min(1)).min(1).max(30),
})).max(30);

function normalizePhone(value?: string | null) {
  return (value ?? "").trim().replace(/[\s()-]+/g, "");
}

async function assertCanManageStaff(session: StaffSession, tx: TenantDb) {
  const actorRoles = await tx.userRole.findMany({ where: { userId: session.userId }, select: { role: { select: { key: true, name: true } } } });
  const actorRoleKeys = actorRoles.map((r) => r.role.key?.trim() || roleKeyForName(r.role.name));
  const actorIsOwner = actorRoleKeys.includes("owner");
  const canManage = actorIsOwner || await hasPermission(tx, session.userId, "users:write");
  return { actorIsOwner, canManage };
}

function parseTeachingAssignments(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [] as Array<{ classId: string; subjectIds: string[] }>;
  try {
    return teachingAssignmentsSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function flattenSelections(selections: Array<{ classId: string; subjectIds: string[] }>) {
  const unique = new Map<string, { classId: string; subjectId: string }>();
  for (const row of selections) {
    for (const subjectId of row.subjectIds) {
      const key = `${row.classId}:${subjectId}`;
      if (!unique.has(key)) unique.set(key, { classId: row.classId, subjectId });
    }
  }
  return [...unique.values()];
}

async function validateTeachingPairs(tx: TenantDb, schoolId: string, selections: Array<{ classId: string; subjectIds: string[] }>) {
  const requested = flattenSelections(selections);
  if (!requested.length) return { ok: true as const, pairs: [] as AssignmentPair[] };
  const offerings = await tx.$queryRaw<OfferingRow[]>`
    SELECT o."classId", o."subjectId", c."name" AS "className", s."name" AS "subjectName"
    FROM "ClassSubjectOffering" o
    INNER JOIN "Class" c ON c."id" = o."classId" AND c."schoolId" = o."schoolId"
    INNER JOIN "Subject" s ON s."id" = o."subjectId" AND s."schoolId" = o."schoolId"
    WHERE o."schoolId" = ${schoolId}
  `;
  const allowed = new Map(offerings.map((row) => [`${row.classId}:${row.subjectId}`, row]));
  const pairs: AssignmentPair[] = [];
  for (const pair of requested) {
    const offering = allowed.get(`${pair.classId}:${pair.subjectId}`);
    if (!offering) return { ok: false as const, message: "One of the selected subjects is not configured for that class. Update Classes → Subjects & Teachers first." };
    pairs.push(offering);
  }
  return { ok: true as const, pairs };
}

export async function validateStaffDetails(input: { name: string; email?: string; phone?: string }): Promise<StaffDetailsValidation> {
  const session = await requireSchoolSession();
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = normalizePhone(input.phone) || null;
  if (!name) return { ok: false, message: "Enter the staff member's full name before continuing." };
  if (!phone) return { ok: false, message: "Enter a phone number. It becomes the staff member's first-login password and can also be used to sign in." };
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { ok: false, message: "Enter a valid phone number using digits only, with an optional leading +." };

  return withTenant(session.schoolId, async (tx) => {
    const { canManage } = await assertCanManageStaff({ userId: session.userId, schoolId: session.schoolId }, tx);
    if (!canManage) return { ok: false, message: "You do not have permission to create staff records." };
    if (email) {
      const existing = await tx.user.findFirst({ where: { email }, select: { id: true } });
      if (existing) return { ok: false, message: "That email is already used by a school account." };
    }
    const existing = await tx.user.findFirst({ where: { phone }, select: { id: true } });
    if (existing) return { ok: false, message: "That phone number is already used by a school account." };
    return { ok: true };
  });
}

export async function createStaff(formData: FormData): Promise<StaffCreateResult> {
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = normalizePhone(String(formData.get("phone") ?? "")) || null;
  const staffCategory = String(formData.get("staffCategory") ?? formData.get("staffCategorySelect") ?? "").trim();
  const requestedRole = String(formData.get("role") ?? "").trim();
  const customRole = String(formData.get("customRole") ?? "").trim();
  const roleName = requestedRole || customRole;
  const legacyClassId = String(formData.get("primaryClassId") ?? "").trim();
  const legacySubjectId = String(formData.get("subjectId") ?? "").trim();
  const parsedAssignments = parseTeachingAssignments(formData.get("teachingAssignments"));
  if (parsedAssignments === null) return { ok: false, message: "Teaching assignments are invalid. Refresh the page and try again." };
  const teachingAssignments = parsedAssignments.length ? parsedAssignments : (legacyClassId && legacySubjectId ? [{ classId: legacyClassId, subjectIds: [legacySubjectId] }] : []);
  const classHeadId = String(formData.get("classHeadId") ?? (String(formData.get("makeClassHead") ?? "") === "on" ? legacyClassId : "")).trim();
  const hodClassId = String(formData.get("hodClassId") ?? "").trim();
  const hodSubjectId = String(formData.get("hodSubjectId") ?? "").trim();

  const requestedStaffType = String(formData.get("staffType") ?? "").trim().toLowerCase();
  const staffType = requestedStaffType === "teaching" || requestedStaffType === "non-teaching" ? requestedStaffType : "non-teaching";
  const roleKey = roleKeyForName(roleName);
  const isTeachingRole = staffType === "teaching" || isTeachingRoleKey(roleKey);

  if (!name) return { ok: false, message: "Enter the staff member's full name." };
  if (!phone) return { ok: false, message: "A phone number is required so the staff member has an immediate first-login credential." };
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { ok: false, message: "Enter a valid phone number using digits only, with an optional leading +." };
  if (!staffCategory) return { ok: false, message: "Select a workforce area." };
  if (!roleName) return { ok: false, message: "Select a staff role." };
  if (roleKey === "owner") return { ok: false, message: "The Owner account is reserved for the school's primary owner." };
  if (!isTeachingRole && (teachingAssignments.length || classHeadId || hodClassId || hodSubjectId)) return { ok: false, message: "Teaching, class-lead and HOD assignments are available for teaching staff." };

  return withTenant(session.schoolId, async (tx) => {
    const { actorIsOwner, canManage } = await assertCanManageStaff({ userId: session.userId, schoolId: session.schoolId }, tx);
    if (!canManage) return { ok: false, message: "You do not have permission to create staff records." };
    if (roleKey === "administrator" && !actorIsOwner) return { ok: false, message: "Only the school Owner can create an Administrator account." };

    if (email) {
      const existing = await tx.user.findFirst({ where: { email } });
      if (existing) return { ok: false, message: "That email is already used by a school account." };
    }
    const phoneOwner = await tx.user.findFirst({ where: { phone } });
    if (phoneOwner) return { ok: false, message: "That phone number is already used by a school account." };

    const assignmentValidation = await validateTeachingPairs(tx, session.schoolId, teachingAssignments);
    if (!assignmentValidation.ok) return { ok: false, message: assignmentValidation.message };
    const assignmentPairs = assignmentValidation.pairs;

    const [headClass, hodClass, hodSubject] = await Promise.all([
      classHeadId ? tx.class.findFirst({ where: { id: classHeadId, schoolId: session.schoolId }, select: { id: true, name: true, classTeacherId: true } }) : Promise.resolve(null),
      hodClassId ? tx.class.findFirst({ where: { id: hodClassId, schoolId: session.schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
      hodSubjectId ? tx.subject.findFirst({ where: { id: hodSubjectId, schoolId: session.schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    if (classHeadId && !headClass) return { ok: false, message: "The selected headteacher class no longer exists." };
    if (hodClassId && !hodClass) return { ok: false, message: "The selected HOD class no longer exists." };
    if (hodSubjectId && !hodSubject) return { ok: false, message: "The selected HOD subject no longer exists." };
    if (headClass?.classTeacherId) return { ok: false, message: `${headClass.name} already has a headteacher. Change that assignment from the class or staff management page first.` };

    const existingRole = await tx.role.findUnique({
      where: { schoolId_name: { schoolId: session.schoolId, name: roleName } },
      include: { rolePermissions: { include: { permission: true } } }
    });
    const permissionKeys = [...new Set(existingRole
      ? existingRole.rolePermissions.map(({ permission }) => permission.key)
      : DEFAULT_ROLE_PERMISSIONS[roleName] ?? staffRolePermissionKeys(roleName))];
    if (!actorIsOwner) {
      for (const key of permissionKeys) {
        if (!(await hasPermission(tx, session.userId, key))) return { ok: false, message: "You cannot assign permissions your account does not have. Ask the school Owner to assign this role." };
      }
    }
    const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
    if (permissions.length !== permissionKeys.length) return { ok: false, message: "This role's permission preset is not fully installed. Update the school permission catalogue before creating this staff record." };

    const role = existingRole ?? await tx.role.create({ data: { schoolId: session.schoolId, name: roleName, key: roleKey, isSystem: Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_PERMISSIONS, roleName) } });
    if (!existingRole && permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ schoolId: session.schoolId, roleId: role.id, permissionId: permission.id })) });

    const initialPasswordHash = await hash(phone, 12);
    let user;
    try {
      user = await tx.user.create({ data: { schoolId: session.schoolId, name, email, phone, passwordHash: initialPasswordHash, status: "active", needsPasswordChange: true }, select: { id: true, name: true, email: true, phone: true, status: true } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { ok: false as const, message: "That email or phone number was just used by another account. Refresh and try again." };
      throw error;
    }

    await tx.userRole.create({ data: { schoolId: session.schoolId, userId: user.id, roleId: role.id } });
    if (isTeachingRole && assignmentPairs.length) {
      await tx.classSubjectTeacher.createMany({ data: assignmentPairs.map((pair) => ({ schoolId: session.schoolId, classId: pair.classId, subjectId: pair.subjectId, teacherId: user.id })), skipDuplicates: true });
    }
    if (isTeachingRole && headClass) await tx.class.update({ where: { id: headClass.id }, data: { classTeacherId: user.id } });
    if (isTeachingRole && hodClass) await tx.$executeRaw`INSERT INTO "ClassHodAssignment" ("schoolId","classId","userId","createdBy") VALUES (${session.schoolId},${hodClass.id},${user.id},${session.userId}) ON CONFLICT DO NOTHING`;
    if (isTeachingRole && hodSubject) await tx.$executeRaw`INSERT INTO "SubjectHodAssignment" ("schoolId","subjectId","userId","createdBy") VALUES (${session.schoolId},${hodSubject.id},${user.id},${session.userId}) ON CONFLICT DO NOTHING`;

    await tx.auditLogSchool.create({
      data: {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "staff.created_active",
        entityType: "User",
        entityId: user.id,
        after: {
          name, email, phone, staffType, staffCategory, role: roleName, roleKey, permissionCount: permissions.length,
          teachingAssignments: assignmentPairs.map((pair) => ({ classId: pair.classId, subjectId: pair.subjectId })),
          classHeadteacherId: headClass?.id ?? null,
          hodClassId: hodClass?.id ?? null,
          hodSubjectId: hodSubject?.id ?? null,
          loginCreated: true,
          firstLoginPasswordSource: "phone",
        }
      }
    });

    const assignmentParts: string[] = [];
    if (assignmentPairs.length) assignmentParts.push(`teaches ${assignmentPairs.length} class-subject assignment${assignmentPairs.length === 1 ? "" : "s"} across ${new Set(assignmentPairs.map((pair) => pair.classId)).size} class${new Set(assignmentPairs.map((pair) => pair.classId)).size === 1 ? "" : "es"}`);
    if (headClass) assignmentParts.push(`headteacher of ${headClass.name}`);
    if (hodClass) assignmentParts.push(`class HOD for ${hodClass.name}`);
    if (hodSubject) assignmentParts.push(`subject HOD for ${hodSubject.name}`);
    const assignment = assignmentParts.length ? ` Assignments: ${assignmentParts.join("; ")}.` : "";
    return { ok: true, name: user.name, status: "active", message: `${user.name} is ready. Login is active immediately: use the phone number or email as the username, and the phone number as the first password.${assignment}` };
  });
}

export async function updateStaffTeachingAssignments(input: { staffId: string; assignments: Array<{ classId: string; subjectIds: string[] }> }): Promise<StaffTeachingUpdateResult> {
  const session = await requireSchoolSession();
  const parsed = z.object({ staffId: z.string().min(1), assignments: teachingAssignmentsSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Teaching assignments are invalid. Refresh the profile and try again." };

  return withTenant(session.schoolId, async (tx) => {
    const { canManage } = await assertCanManageStaff({ userId: session.userId, schoolId: session.schoolId }, tx);
    if (!canManage) return { ok: false, message: "You do not have permission to change teaching assignments." };
    const target = await tx.user.findFirst({
      where: { id: parsed.data.staffId, schoolId: session.schoolId },
      select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } },
    });
    if (!target || !isSchoolStaffAccount(target.userRoles.map(({ role }) => role))) return { ok: false, message: "Staff member was not found." };
    const assignmentValidation = await validateTeachingPairs(tx, session.schoolId, parsed.data.assignments);
    if (!assignmentValidation.ok) return { ok: false, message: assignmentValidation.message };
    const pairs = assignmentValidation.pairs;
    const teachingRole = target.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)));
    if (pairs.length && !teachingRole) return { ok: false, message: "Give this staff member a teaching role before assigning classes and subjects." };

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-teaching:${session.schoolId}:${target.id}`}))`;
    const before = await tx.classSubjectTeacher.findMany({ where: { schoolId: session.schoolId, teacherId: target.id }, select: { classId: true, subjectId: true } });
    await tx.classSubjectTeacher.deleteMany({ where: { schoolId: session.schoolId, teacherId: target.id } });
    if (pairs.length) await tx.classSubjectTeacher.createMany({ data: pairs.map((pair) => ({ schoolId: session.schoolId, classId: pair.classId, subjectId: pair.subjectId, teacherId: target.id })), skipDuplicates: true });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "staff.teaching_assignments_updated", entityType: "User", entityId: target.id, before, after: pairs.map((pair) => ({ classId: pair.classId, subjectId: pair.subjectId })) } });
    return { ok: true, count: pairs.length, message: `${target.name}'s teaching assignments were updated.` };
  });
}
