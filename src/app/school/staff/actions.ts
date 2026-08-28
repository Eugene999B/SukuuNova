"use server";

import { hash } from "bcryptjs";
import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";

export type StaffCreateResult = { ok: true; name: string; username: string; temporaryPassword: string } | { ok: false; message: string };

export async function createStaff(formData: FormData): Promise<StaffCreateResult> {
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const roleName = String(formData.get("role") ?? "").trim();
  const staffType = String(formData.get("staffType") ?? "").trim();
  const staffCategory = String(formData.get("staffCategory") ?? "").trim();
  const primaryClassId = String(formData.get("primaryClassId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();

  if (!name || !roleName || !staffType || !staffCategory) return { ok: false, message: "Name, workforce category, role and login type are required." };
  if (!email && !phone) return { ok: false, message: "Provide an email address or phone number for school login." };
  if (roleName.toLowerCase() === "owner") return { ok: false, message: "The Owner account is reserved for the school's primary owner." };

  return withTenant(session.schoolId, async (tx) => {
    const actorRoles = await tx.userRole.findMany({ where: { userId: session.userId }, select: { role: { select: { name: true } } } });
    const actorIsOwner = actorRoles.some((r) => r.role.name.toLowerCase() === "owner");
    const actorIsAdmin = actorRoles.some((r) => r.role.name.toLowerCase() === "administrator" || r.role.name.toLowerCase() === "admin");
    const canManage = actorIsOwner || actorIsAdmin || await hasPermission(tx, session.userId, "classes:manage");
    if (!canManage) return { ok: false, message: "You do not have permission to create staff accounts." };
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

    const temporaryPassword = "12345";
    const user = await tx.user.create({
      data: {
        schoolId: session.schoolId,
        name,
        email,
        phone,
        passwordHash: await hash(temporaryPassword, 12),
        status: "active"
      },
      select: { id: true, name: true, email: true, phone: true }
    });

    await tx.userRole.create({
      data: {
        schoolId: session.schoolId,
        userId: user.id,
        roleId: role.id
      }
    });

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
      await tx.classSubjectTeacher.upsert({
        where: { classId_subjectId_teacherId: { classId: primaryClassId, subjectId, teacherId: user.id } },
        update: {},
        create: { schoolId: session.schoolId, classId: primaryClassId, subjectId, teacherId: user.id }
      });
    }

    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "staff.created", entityType: "User", entityId: user.id, after: { name, email, phone, staffType, staffCategory, role: roleName, primaryClassId: primaryClassId || null, subjectId: subjectId || null } } });
    return { ok: true, name: user.name, username: user.email ?? user.phone ?? "School login", temporaryPassword };
  });
}
