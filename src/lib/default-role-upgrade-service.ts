import { createHash } from "node:crypto";
import { z } from "zod";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { getSchoolAuthorization, roleKeyForName } from "./authorization";
import { requirePermission } from "./rbac";
import { lockSchoolAccess } from "./owner-governance";
import { DEFAULT_ROLE_PERMISSIONS } from "./default-rbac";
import { permissionCatalogEntry, permissionDescription } from "./permission-catalog";
import { appendSchoolAudit } from "./audit";

export const defaultRoleUpgradeSchema = z.object({
  confirmed: z.literal(true),
  roles: z.array(z.object({
    roleId: z.string().min(1).max(100),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    permissionKeys: z.array(z.string().min(1).max(100)).min(1).max(100),
  })).min(1).max(20),
}).superRefine((input, ctx) => {
  if (new Set(input.roles.map(role => role.roleId)).size !== input.roles.length ||
      input.roles.some(role => new Set(role.permissionKeys).size !== role.permissionKeys.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose each role and permission only once." });
  }
});
type Context = { schoolId: string; actorId: string };
export type DefaultRoleUpgradeInput = z.infer<typeof defaultRoleUpgradeSchema>;

async function requireUpgradeOwner(tx: TenantDb, input: Context) {
  await lockSchoolAccess(tx, input.schoolId);
  const access = await getSchoolAuthorization(tx, input.actorId);
  if (!access.isOwner || access.user.schoolId !== input.schoolId) throw new ForbiddenError("Only an active school Owner can review or apply default-role upgrades.");
  await requirePermission(tx, input.actorId, "settings:manage_roles");
}

async function readPreview(tx: TenantDb, schoolId: string) {
  const roles = await tx.role.findMany({
    where: { schoolId, isSystem: true },
    include: {
      rolePermissions: { select: { permission: { select: { key: true } } } },
      userRoles: { select: { user: { select: {
        id: true, status: true,
        permissionOverrides: { select: { granted: true, permission: { select: { key: true } } } },
      } } } },
    },
    orderBy: { name: "asc" },
  });
  return { roles: roles.flatMap(role => {
    // Only an explicitly identified system role is eligible; names never promote custom roles.
    const baselineName = Object.keys(DEFAULT_ROLE_PERMISSIONS).find(name => roleKeyForName(name) === role.key);
    if (!baselineName) return [];
    const baseline = [...new Set(DEFAULT_ROLE_PERMISSIONS[baselineName])].sort();
    const current = role.rolePermissions.map(item => item.permission.key).sort();
    const members = role.userRoles.map(({ user }) => ({
      id: user.id, status: user.status,
      overrides: user.permissionOverrides.map(item => ({ key: item.permission.key, granted: item.granted })).sort((a, b) => a.key.localeCompare(b.key)),
    })).sort((a, b) => a.id.localeCompare(b.id));
    const revision = createHash("sha256").update(JSON.stringify({ schoolId, id: role.id, name: role.name, key: role.key, baseline, current, members })).digest("hex");
    return [{
      roleId: role.id, name: role.name, baselineName, revision,
      assignedAccounts: members.length,
      activeAccounts: members.filter(member => member.status === "active").length,
      currentPermissionCount: current.length,
      preservedExtraCount: current.filter(key => !baseline.some(item => item === key)).length,
      additions: baseline.filter(key => !current.includes(key)).map(key => ({
        ...permissionCatalogEntry(key),
        deniedAccounts: members.filter(member => member.overrides.some(item => item.key === key && !item.granted)).length,
      })),
    }];
  }) };
}
export type DefaultRoleUpgradePreview = Awaited<ReturnType<typeof readPreview>>;

export async function previewDefaultRoleUpgrades(tx: TenantDb, input: Context) {
  await requireUpgradeOwner(tx, input);
  return readPreview(tx, input.schoolId);
}

export async function applyDefaultRoleUpgrades(tx: TenantDb, input: Context & DefaultRoleUpgradeInput) {
  const plan = defaultRoleUpgradeSchema.parse(input);
  await requireUpgradeOwner(tx, input);
  const preview = await readPreview(tx, input.schoolId);
  // Validate the complete review before writing anything.
  for (const requested of plan.roles) {
    const role = preview.roles.find(item => item.roleId === requested.roleId);
    if (!role) throw new AppError("This role is not an eligible system role in this school.", 404, "ROLE_NOT_ELIGIBLE");
    if (role.revision !== requested.revision) throw new AppError("Role permissions or assigned accounts changed after this review. Refresh and review the updated impact before applying.", 409, "ROLE_UPGRADE_CONFLICT");
    if (requested.permissionKeys.some(key => !role.additions.some(item => item.key === key))) throw new AppError("Select only missing permissions from the displayed default-role review.", 400, "INVALID_ROLE_UPGRADE");
  }
  let addedPermissions = 0;
  for (const requested of plan.roles) {
    const role = preview.roles.find(item => item.roleId === requested.roleId)!;
    for (const key of [...requested.permissionKeys].sort()) {
      const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: permissionDescription(key) } });
      await tx.rolePermission.create({ data: { schoolId: input.schoolId, roleId: role.roleId, permissionId: permission.id } });
      addedPermissions += 1;
    }
    await appendSchoolAudit(tx, {
      schoolId: input.schoolId, actorId: input.actorId, action: "role.defaults_upgraded", entityType: "Role", entityId: role.roleId,
      before: { revision: role.revision, permissionCount: role.currentPermissionCount },
      after: { name: role.name, baselineName: role.baselineName, addedPermissionKeys: [...requested.permissionKeys].sort(), assignedAccounts: role.assignedAccounts, activeAccounts: role.activeAccounts, directOverridesPreserved: true, existingPermissionsPreserved: true },
    });
  }
  return { addedPermissions, updatedRoles: plan.roles.length, preview: await readPreview(tx, input.schoolId) };
}
