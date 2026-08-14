import { createId } from "@paralleldrive/cuid2";
import { hash } from "bcryptjs";
import { db, withTenant } from "./db";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLE_PERMISSIONS
} from "./default-rbac";

export async function onboardSchool(input: {
  adminId: string;
  adminRole: string;
  uniqueCode: string;
  schoolName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}) {
  if (!["super_admin", "platform_admin"].includes(input.adminRole)) {
    throw new ForbiddenError("Platform school onboarding is not permitted.");
  }
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(uniqueCode)) {
    throw new AppError("School code must be 3-40 lowercase letters, numbers, or hyphens.", 400, "INVALID_SCHOOL_CODE");
  }
  if (input.ownerPassword.length < 12) {
    throw new AppError("Owner password must contain at least 12 characters.", 400, "WEAK_PASSWORD");
  }
  const duplicate = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode } });
  if (duplicate) throw new AppError("School code already exists.", 409, "DUPLICATE_SCHOOL_CODE");

  const permissionIds = new Map<string, string>();
  for (const key of DEFAULT_PERMISSIONS) {
    const permission = await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: "SukuuNova permission: " + key }
    });
    permissionIds.set(key, permission.id);
  }
  const schoolId = createId();
  const ownerPasswordHash = await hash(input.ownerPassword, 12);
  const result = await withTenant(schoolId, async (tx) => {
    const school = await tx.school.create({
      data: { id: schoolId, uniqueCode, name: input.schoolName.trim() }
    });
    await tx.schoolLoginDirectory.create({ data: { schoolId, uniqueCode } });
    await tx.schoolSettings.create({ data: { schoolId } });
    const roleIds = new Map<string, string>();
    for (const name of DEFAULT_ROLE_NAMES) {
      const role = await tx.role.create({
        data: {
          schoolId,
          name,
          key: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          isSystem: true
        }
      });
      roleIds.set(name, role.id);
      await tx.rolePermission.createMany({
        data: DEFAULT_ROLE_PERMISSIONS[name].map((key) => ({
          schoolId,
          roleId: role.id,
          permissionId: permissionIds.get(key)!
        }))
      });
    }
    const owner = await tx.user.create({
      data: {
        schoolId,
        name: input.ownerName.trim(),
        email: input.ownerEmail.trim().toLowerCase(),
        passwordHash: ownerPasswordHash
      }
    });
    await tx.userRole.create({
      data: { schoolId, userId: owner.id, roleId: roleIds.get("Owner")! }
    });
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: owner.id,
      action: "school.onboarded",
      entityType: "School",
      entityId: schoolId,
      after: { uniqueCode, ownerId: owner.id }
    });
    return { school, ownerId: owner.id };
  });
  await appendPlatformAudit({
    actorId: input.adminId,
    action: "school.onboarded",
    targetSchoolId: schoolId,
    targetEntity: "School",
    meta: { uniqueCode, ownerId: result.ownerId }
  });
  return result;
}
