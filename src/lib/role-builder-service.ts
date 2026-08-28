import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

async function permissionRows(tx: TenantDb, keys: string[]) {
  const unique = [...new Set(keys)];
  const rows = await tx.permission.findMany({ where: { key: { in: unique } } });
  if (rows.length !== unique.length) {
    throw new AppError("One or more permission keys are invalid.", 400, "INVALID_PERMISSION");
  }
  return rows;
}

export async function customRoleBuilderData(tx: TenantDb, actorId: string) {
  await requirePermission(tx, actorId, "roles:create_custom");
  const [permissions, roles] = await Promise.all([
    tx.permission.findMany({ orderBy: { key: "asc" } }),
    tx.role.findMany({
      where: { isSystem: false },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: "asc" }
    })
  ]);
  return { permissions, roles };
}

export async function createCustomRole(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    name: string;
    permissionKeys: string[];
  }
) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  const permissions = await permissionRows(tx, input.permissionKeys);
  const role = await tx.role.create({
    data: {
      schoolId: input.schoolId,
      name: input.name.trim(),
      key: "custom_" + input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      isSystem: false
    }
  });
  await tx.rolePermission.createMany({
    data: permissions.map((permission) => ({
      schoolId: input.schoolId,
      roleId: role.id,
      permissionId: permission.id
    }))
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "custom_role.created",
    entityType: "Role",
    entityId: role.id,
    after: { name: role.name, permissionKeys: input.permissionKeys }
  });
  return role;
}

export async function updateCustomRole(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    roleId: string;
    name: string;
    permissionKeys: string[];
  }
) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  const role = await tx.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("Custom role not found.", 404, "NOT_FOUND");
  if (role.isSystem) {
    throw new AppError("System roles cannot be edited in the custom-role builder.", 403, "SYSTEM_ROLE_PROTECTED");
  }
  const permissions = await permissionRows(tx, input.permissionKeys);
  await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
  await tx.rolePermission.createMany({
    data: permissions.map((permission) => ({
      schoolId: input.schoolId,
      roleId: role.id,
      permissionId: permission.id
    }))
  });
  const updated = await tx.role.update({
    where: { id: role.id },
    data: { name: input.name.trim() }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "custom_role.updated",
    entityType: "Role",
    entityId: role.id,
    before: { name: role.name },
    after: { name: updated.name, permissionKeys: input.permissionKeys }
  });
  return updated;
}

export async function deleteCustomRole(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; roleId: string }
) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  const role = await tx.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("Custom role not found.", 404, "NOT_FOUND");
  if (role.isSystem) {
    throw new AppError("System roles cannot be deleted.", 403, "SYSTEM_ROLE_PROTECTED");
  }
  await tx.role.delete({ where: { id: role.id } });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "custom_role.deleted",
    entityType: "Role",
    entityId: role.id,
    before: { name: role.name }
  });
}
