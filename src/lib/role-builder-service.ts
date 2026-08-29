import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSIONS } from "./default-rbac";

export async function syncDefaultRbac(tx: TenantDb, schoolId: string) {
  const permissionIds = new Map<string,string>();
  for (const key of DEFAULT_PERMISSIONS) {
    const row = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: "SukuuNova baseline permission: " + key } });
    permissionIds.set(key, row.id);
  }
  for (const roleName of DEFAULT_ROLE_NAMES) {
    const role = await tx.role.upsert({ where: { schoolId_name: { schoolId, name: roleName } }, update: { isSystem: true }, create: { schoolId, name: roleName, key: roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_"), isSystem: true } });
    for (const permissionKey of DEFAULT_ROLE_PERMISSIONS[roleName]) {
      const permissionId = permissionIds.get(permissionKey);
      if (!permissionId) continue;
      await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId } }, update: { schoolId }, create: { schoolId, roleId: role.id, permissionId } });
    }
  }
}

async function permissionRows(tx: TenantDb, keys: string[]) {
  const unique = [...new Set(keys)];
  const rows = await tx.permission.findMany({ where: { key: { in: unique } } });
  if (rows.length !== unique.length) throw new AppError("One or more permission keys are invalid.", 400, "INVALID_PERMISSION");
  return rows;
}

export async function customRoleBuilderData(tx: TenantDb, actorId: string) {
  await requirePermission(tx, actorId, "roles:create_custom");
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { schoolId: true } });
  if (!actor) throw new AppError("Account not found.", 404, "NOT_FOUND");
  await syncDefaultRbac(tx, actor.schoolId);
  const [permissions, roles] = await Promise.all([
    tx.permission.findMany({ orderBy: { key: "asc" } }),
    tx.role.findMany({ where: { schoolId: actor.schoolId, isSystem: false }, include: { rolePermissions: { include: { permission: true } } }, orderBy: { name: "asc" } })
  ]);
  return { permissions, roles };
}

export async function createCustomRole(tx: TenantDb, input: { schoolId: string; actorId: string; name: string; permissionKeys: string[] }) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  await syncDefaultRbac(tx, input.schoolId);
  const permissions = await permissionRows(tx, input.permissionKeys);
  const role = await tx.role.create({ data: { schoolId: input.schoolId, name: input.name.trim(), key: "custom_" + input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), isSystem: false } });
  await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ schoolId: input.schoolId, roleId: role.id, permissionId: permission.id })) });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "custom_role.created", entityType: "Role", entityId: role.id, after: { name: role.name, permissionKeys: input.permissionKeys } });
  return role;
}

export async function updateCustomRole(tx: TenantDb, input: { schoolId: string; actorId: string; roleId: string; name: string; permissionKeys: string[] }) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  await syncDefaultRbac(tx, input.schoolId);
  const role = await tx.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("Custom role not found.", 404, "NOT_FOUND");
  if (role.isSystem) throw new AppError("System roles cannot be edited in the custom-role builder.", 403, "SYSTEM_ROLE_PROTECTED");
  const permissions = await permissionRows(tx, input.permissionKeys);
  await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
  await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ schoolId: input.schoolId, roleId: role.id, permissionId: permission.id })) });
  const updated = await tx.role.update({ where: { id: role.id }, data: { name: input.name.trim() } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "custom_role.updated", entityType: "Role", entityId: role.id, before: { name: role.name }, after: { name: updated.name, permissionKeys: input.permissionKeys } });
  return updated;
}

export async function deleteCustomRole(tx: TenantDb, input: { schoolId: string; actorId: string; roleId: string }) {
  await requirePermission(tx, input.actorId, "roles:create_custom");
  const role = await tx.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("Custom role not found.", 404, "NOT_FOUND");
  if (role.isSystem) throw new AppError("System roles cannot be deleted.", 403, "SYSTEM_ROLE_PROTECTED");
  await tx.role.delete({ where: { id: role.id } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "custom_role.deleted", entityType: "Role", entityId: role.id, before: { name: role.name } });
}
