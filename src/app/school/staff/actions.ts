"use server";

import { hash } from "bcryptjs";
import { withTenant } from "@/lib/db";
import type { TenantDb } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";
import { roleKeyForName, isTeachingRoleKey } from "@/lib/authorization";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/default-rbac";
import { staffRolePermissionKeys } from "@/lib/staff-role-presets";

export type StaffCreateResult = { ok: true; name: string; status: "active"; message: string } | { ok: false; message: string };
export type StaffDetailsValidation = { ok: true } | { ok: false; message: string };

type StaffSession = { userId: string; schoolId: string };

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
  const primaryClassId = String(formData.get("primaryClassId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const makeClassHead = String(formData.get("makeClassHead") ?? "") === "on";
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
  if (!isTeachingRole && (primaryClassId || subjectId || makeClassHead || hodClassId || hodSubjectId)) return { ok: false, message: "Teaching, class-lead and HOD assignments are available for teaching staff." };
  if (makeClassHead && !primaryClassId) return { ok: false, message: "Choose a class before making this staff member the class headteacher." };

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

    const [schoolClass, subject, hodClass, hodSubject] = await Promise.all([
      primaryClassId ? tx.class.findFirst({ where: { id: primaryClassId, schoolId: session.schoolId }, select: { id: true, name: true, classTeacherId: true } }) : Promise.resolve(null),
      subjectId ? tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
      hodClassId ? tx.class.findFirst({ where: { id: hodClassId, schoolId: session.schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
      hodSubjectId ? tx.subject.findFirst({ where: { id: hodSubjectId, schoolId: session.schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    if (primaryClassId && !schoolClass) return { ok: false, message: "The selected teaching class no longer exists." };
    if (subjectId && !subject) return { ok: false, message: "The selected teaching subject no longer exists." };
    if (hodClassId && !hodClass) return { ok: false, message: "The selected HOD class no longer exists." };
    if (hodSubjectId && !hodSubject) return { ok: false, message: "The selected HOD subject no longer exists." };
    if (makeClassHead && schoolClass?.classTeacherId) return { ok: false, message: `${schoolClass.name} already has a headteacher. Change that assignment from the class or staff management page first.` };

    const existingRole = await tx.role.findUnique({
      where: { schoolId_name: { schoolId: session.schoolId, name: roleName } },
      include: { rolePermissions: { include: { permission: true } } }
    });
    const permissionKeys = [...new Set(existingRole
      ? existingRole.rolePermissions.map(({ permission }) => permission.key)
      : DEFAULT_ROLE_PERMISSIONS[roleName] ?? staffRolePermissionKeys(roleName))];
    if (!actorIsOwner) {
      for (const key of permissionKeys) {
        if (!(await hasPermission(tx, session.userId, key))) {
          return { ok: false, message: "You cannot assign permissions your account does not have. Ask the school Owner to assign this role." };
        }
      }
    }
    const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
    if (permissions.length !== permissionKeys.length) return { ok: false, message: "This role's permission preset is not fully installed. Update the school permission catalogue before creating this staff record." };

    const role = existingRole ?? await tx.role.create({
      data: { schoolId: session.schoolId, name: roleName, key: roleKey, isSystem: Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_PERMISSIONS, roleName) }
    });
    if (!existingRole && permissions.length) {
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ schoolId: session.schoolId, roleId: role.id, permissionId: permission.id })) });
    }

    const initialPasswordHash = await hash(phone, 12);
    let user;
    try {
      user = await tx.user.create({
        data: { schoolId: session.schoolId, name, email, phone, passwordHash: initialPasswordHash, status: "active", needsPasswordChange: true },
        select: { id: true, name: true, email: true, phone: true, status: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { ok: false as const, message: "That email or phone number was just used by another account. Refresh and try again." };
      throw error;
    }

    await tx.userRole.create({ data: { schoolId: session.schoolId, userId: user.id, roleId: role.id } });

    if (isTeachingRole && schoolClass && subject) {
      await tx.classSubjectTeacher.create({ data: { schoolId: session.schoolId, classId: schoolClass.id, subjectId: subject.id, teacherId: user.id } });
    }
    if (isTeachingRole && schoolClass && makeClassHead) {
      await tx.class.update({ where: { id: schoolClass.id }, data: { classTeacherId: user.id } });
    }
    if (isTeachingRole && hodClass) {
      await tx.$executeRaw`
        INSERT INTO "ClassHodAssignment" ("schoolId","classId","userId","createdBy")
        VALUES (${session.schoolId},${hodClass.id},${user.id},${session.userId})
        ON CONFLICT DO NOTHING
      `;
    }
    if (isTeachingRole && hodSubject) {
      await tx.$executeRaw`
        INSERT INTO "SubjectHodAssignment" ("schoolId","subjectId","userId","createdBy")
        VALUES (${session.schoolId},${hodSubject.id},${user.id},${session.userId})
        ON CONFLICT DO NOTHING
      `;
    }

    await tx.auditLogSchool.create({
      data: {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "staff.created_active",
        entityType: "User",
        entityId: user.id,
        after: {
          name,
          email,
          phone,
          staffType,
          staffCategory,
          role: roleName,
          roleKey,
          permissionCount: permissions.length,
          primaryClassId: schoolClass?.id ?? null,
          subjectId: subject?.id ?? null,
          classHeadteacher: Boolean(schoolClass && makeClassHead),
          hodClassId: hodClass?.id ?? null,
          hodSubjectId: hodSubject?.id ?? null,
          loginCreated: true,
          firstLoginPasswordSource: "phone",
        }
      }
    });

    const assignmentParts: string[] = [];
    if (schoolClass && subject) assignmentParts.push(`teaches ${subject.name} in ${schoolClass.name}`);
    if (schoolClass && makeClassHead) assignmentParts.push(`headteacher of ${schoolClass.name}`);
    if (hodClass) assignmentParts.push(`class HOD for ${hodClass.name}`);
    if (hodSubject) assignmentParts.push(`subject HOD for ${hodSubject.name}`);
    const assignment = assignmentParts.length ? ` Assignments: ${assignmentParts.join("; ")}.` : "";
    return { ok: true, name: user.name, status: "active", message: `${user.name} is ready. Login is active immediately: use the phone number or email as the username, and the phone number as the first password.${assignment}` };
  });
}
