"use server";

import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";
import { staffRolePermissionKeys } from "@/lib/staff-role-presets";

export type StaffCreateResult = { ok: true; name: string; status: "pending"; message: string } | { ok: false; message: string };
export type StaffDetailsValidation = { ok: true } | { ok: false; message: string };

async function assertCanManageStaff(session: Awaited<ReturnType<typeof requireSchoolSession>>, tx: Parameters<Parameters<typeof withTenant>[1]>[0]) {
  const actorRoles = await tx.userRole.findMany({ where: { userId: session.userId }, select: { role: { select: { name: true } } } });
  const actorIsOwner = actorRoles.some((r) => r.role.name.toLowerCase() === "owner");
  const actorIsAdmin = actorRoles.some((r) => r.role.name.toLowerCase() === "administrator" || r.role.name.toLowerCase() === "admin");
  const canManage = actorIsOwner || actorIsAdmin || await hasPermission(tx, session.userId, "classes:manage");
  return { actorIsOwner, canManage };
}

export async function validateStaffDetails(input: { name: string; email?: string; phone?: string }): Promise<StaffDetailsValidation> {
  const session = await requireSchoolSession();
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!name) return { ok: false, message: "Enter the staff member's full name before continuing." };

  return withTenant(session.schoolId, async (tx) => {
    const { canManage } = await assertCanManageStaff(session, tx);
    if (!canManage) return { ok: false, message: "You do not have permission to create staff records." };
    if (email) {
      const existing = await tx.user.findFirst({ where: { email }, select: { id: true } });
      if (existing) return { ok: false, message: "That email is already used by a school account." };
    }
    if (phone) {
      const existing = await tx.user.findFirst({ where: { phone }, select: { id: true } });
      if (existing) return { ok: false, message: "That phone number is already used by a school account." };
    }
    return { ok: true };
  });
}

export async function createStaff(formData: FormData): Promise<StaffCreateResult> {
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const staffCategory = String(formData.get("staffCategory") ?? formData.get("staffCategorySelect") ?? "").trim();
  const requestedRole = String(formData.get("role") ?? "").trim();
  const customRole = String(formData.get("customRole") ?? "").trim();
  const roleName = requestedRole || customRole;
  const primaryClassId = String(formData.get("primaryClassId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();

  const requestedStaffType = String(formData.get("staffType") ?? "").trim().toLowerCase();
  const staffType = requestedStaffType || (/teacher|assistant/i.test(roleName) ? "teaching" : "non-teaching");

  if (!name) return { ok: false, message: "Enter the staff member's full name." };
  if (!staffCategory) return { ok: false, message: "Select a workforce area." };
  if (!roleName) return { ok: false, message: "Select a staff role." };
  if (roleName.toLowerCase() === "owner") return { ok: false, message: "The Owner account is reserved for the school's primary owner." };

  return withTenant(session.schoolId, async (tx) => {
    const { actorIsOwner, canManage } = await assertCanManageStaff(session, tx);
    if (!canManage) return { ok: false, message: "You do not have permission to create staff records." };
    if (roleName.toLowerCase() === "administrator" && !actorIsOwner) return { ok: false, message: "Only the school Owner can create an Administrator account." };

    if (email) {
      const existing = await tx.user.findFirst({ where: { email } });
      if (existing) return { ok: false, message: "That email is already used by a school account." };
    }
    if (phone) {
      const existing = await tx.user.findFirst({ where: { phone } });
      if (existing) return { ok: false, message: "That phone number is already used by a school account." };
    }

    const role = await tx.role.upsert({
      where: { schoolId_name: { schoolId: session.schoolId, name: roleName } },
      update: {},
      create: { schoolId: session.schoolId, name: roleName, key: roleName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), isSystem: false }
    });

    const permissionKeys = staffRolePermissionKeys(roleName);
    const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys as string[] } }, select: { id: true } });
    if (permissions.length !== permissionKeys.length) return { ok: false, message: "This role's permission preset is not fully installed. Update the school permission catalogue before creating this staff record." };
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ schoolId: session.schoolId, roleId: role.id, permissionId: permission.id })) });

    const placeholderPasswordHash = await hash(randomUUID() + randomUUID(), 12);
    const user = await tx.user.create({ data: { schoolId: session.schoolId, name, email, phone, passwordHash: placeholderPasswordHash, status: "pending" }, select: { id: true, name: true, email: true, phone: true, status: true } });
    await tx.userRole.create({ data: { schoolId: session.schoolId, userId: user.id, roleId: role.id } });

    if (primaryClassId && /teacher/i.test(roleName)) {
      const schoolClass = await tx.class.findFirst({ where: { id: primaryClassId }, select: { id: true } });
      if (!schoolClass) return { ok: false, message: "Selected class does not belong to this school." };
      await tx.class.update({ where: { id: primaryClassId }, data: { classTeacherId: user.id } });
    }
    if (primaryClassId && subjectId && /teacher|assistant/i.test(roleName)) {
      const [schoolClass, subject] = await Promise.all([
        tx.class.findFirst({ where: { id: primaryClassId }, select: { id: true } }),
        tx.subject.findFirst({ where: { id: subjectId }, select: { id: true } })
      ]);
      if (!schoolClass || !subject) return { ok: false, message: "Selected class or subject does not belong to this school." };
      await tx.classSubjectTeacher.upsert({ where: { classId_subjectId_teacherId: { classId: primaryClassId, subjectId, teacherId: user.id } }, update: {}, create: { schoolId: session.schoolId, classId: primaryClassId, subjectId, teacherId: user.id } });
    }

    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "staff.created_pending", entityType: "User", entityId: user.id, after: { name, email, phone, staffType, staffCategory, role: roleName, permissionCount: permissions.length, primaryClassId: primaryClassId || null, subjectId: subjectId || null, loginCreated: false } } });
    return { ok: true, name: user.name, status: "pending", message: `${user.name} was added as staff. No login account was created. Open Sub-accounts & Access to activate a login later.` };
  });
}
