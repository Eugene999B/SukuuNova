import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { hasPermission } from "../src/lib/rbac";
import { previewDefaultRoleUpgrades as preview, applyDefaultRoleUpgrades as apply } from "../src/lib/default-role-upgrade-service";
import { createTenantFixture } from "./helpers";

async function setup() {
  const f = await createTenantFixture();
  const principal = await withTenant(f.schoolId, async tx => {
    await tx.role.update({ where: { id: f.ownerRoleId }, data: { key: "owner" } });
    const role = await tx.role.create({ data: { schoolId: f.schoolId, name: "Principal", key: "principal", isSystem: true } });
    await tx.rolePermission.createMany({ data: ["students:read", "students:delete"].map(key => ({ schoolId: f.schoolId, roleId: role.id, permissionId: f.permissionIds.get(key)! })) });
    await tx.userRole.create({ data: { schoolId: f.schoolId, userId: f.memberId, roleId: role.id } });
    await tx.userPermissionOverride.create({ data: { schoolId: f.schoolId, userId: f.memberId, permissionId: f.permissionIds.get("finance:write")!, granted: false } });
    return role;
  });
  const context = { schoolId: f.schoolId, actorId: f.ownerId };
  const plan = await withTenant(f.schoolId, tx => preview(tx, context));
  const role = plan.roles.find(item => item.roleId === principal.id)!;
  const input = { ...context, confirmed: true as const, roles: [{ roleId: principal.id, revision: role.revision, permissionKeys: ["finance:write", "users:write"] }] };
  return { ...f, principal, context, role, input };
}
describe("Owner-reviewed default role upgrades", () => {
  it("previews defaults and denial impact without modifying policy", async () => {
    const f = await setup();
    expect(f.role.assignedAccounts).toBe(1);
    expect(f.role.activeAccounts).toBe(1);
    expect(f.role.preservedExtraCount).toBe(1);
    expect(f.role.additions.find(item => item.key === "finance:write")?.deniedAccounts).toBe(1);
    expect(f.role.additions.some(item => item.key === "students:delete")).toBe(false);
    expect(await withTenant(f.schoolId, tx => tx.rolePermission.count({ where: { roleId: f.principal.id } }))).toBe(2);
    expect(await withTenant(f.schoolId, tx => tx.auditLogSchool.count({ where: { action: "role.defaults_upgraded" } }))).toBe(0);
  });
  it("adds only selected defaults and preserves extra rights and direct denials", async () => {
    const f = await setup();
    const result = await withTenant(f.schoolId, tx => apply(tx, f.input));
    expect(result.addedPermissions).toBe(2);
    await withTenant(f.schoolId, async tx => {
      const role = await tx.role.findUniqueOrThrow({ where: { id: f.principal.id }, include: { rolePermissions: { include: { permission: true } } } });
      expect(role.key).toBe("principal"); expect(role.isSystem).toBe(true);
      expect(role.rolePermissions.map(item => item.permission.key).sort()).toEqual(["finance:write", "students:delete", "students:read", "users:write"]);
      expect(await hasPermission(tx, f.memberId, "finance:write")).toBe(false);
      expect(await hasPermission(tx, f.memberId, "users:write")).toBe(true);
      const audit = await tx.auditLogSchool.findFirstOrThrow({ where: { action: "role.defaults_upgraded" } });
      expect(audit.actorId).toBe(f.ownerId);
      expect(audit.after).toMatchObject({ addedPermissionKeys: ["finance:write", "users:write"], directOverridesPreserved: true });
    });
  });
  it("requires Owner authority even with role-control permission", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => tx.userPermissionOverride.create({ data: { schoolId: f.schoolId, userId: f.memberId, permissionId: f.permissionIds.get("settings:manage_roles")!, granted: true } }));
    await expect(withTenant(f.schoolId, tx => preview(tx, { ...f.context, actorId: f.memberId }))).rejects.toMatchObject({ status: 403 });
    await expect(withTenant(f.schoolId, tx => apply(tx, { ...f.input, actorId: f.memberId }))).rejects.toMatchObject({ status: 403 });
  });
  it("rejects custom, unidentified and cross-school roles", async () => {
    const f = await setup(), other = await setup();
    const custom = await withTenant(f.schoolId, async tx => {
      const role = await tx.role.create({ data: { schoolId: f.schoolId, name: "Administrator", key: "custom_administrator", isSystem: false } });
      await tx.role.create({ data: { schoolId: f.schoolId, name: "Vice Principal", key: null, isSystem: true } });
      return role;
    });
    const plan = await withTenant(f.schoolId, tx => preview(tx, f.context));
    expect(plan.roles.some(role => role.name === "Administrator" || role.name === "Vice Principal")).toBe(false);
    for (const roleId of [custom.id, other.principal.id]) await expect(withTenant(f.schoolId, tx => apply(tx, { ...f.input, roles: [{ ...f.input.roles[0], roleId }] }))).rejects.toMatchObject({ code: "ROLE_NOT_ELIGIBLE" });
  });
  it.each(["permission", "membership", "override"] as const)("invalidates review after %s changes", async change => {
    const f = await setup();
    await withTenant(f.schoolId, async tx => {
      if (change === "permission") await tx.rolePermission.create({ data: { schoolId: f.schoolId, roleId: f.principal.id, permissionId: f.permissionIds.get("audit:read")! } });
      if (change === "membership") await tx.userRole.create({ data: { schoolId: f.schoolId, roleId: f.principal.id, userId: f.ownerId } });
      if (change === "override") await tx.userPermissionOverride.update({ where: { userId_permissionId: { userId: f.memberId, permissionId: f.permissionIds.get("finance:write")! } }, data: { granted: true } });
    });
    await expect(withTenant(f.schoolId, tx => apply(tx, f.input))).rejects.toMatchObject({ code: "ROLE_UPGRADE_CONFLICT", status: 409 });
    expect(await withTenant(f.schoolId, tx => tx.auditLogSchool.count({ where: { action: "role.defaults_upgraded" } }))).toBe(0);
  });
  it("serializes concurrent approvals and rejects old-review replay", async () => {
    const f = await setup();
    const outcomes = await Promise.allSettled([1, 2].map(() => withTenant(f.schoolId, tx => apply(tx, f.input))));
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const failed = outcomes.find(outcome => outcome.status === "rejected");
    expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({ code: "ROLE_UPGRADE_CONFLICT" });
    expect(await withTenant(f.schoolId, tx => tx.auditLogSchool.count({ where: { action: "role.defaults_upgraded" } }))).toBe(1);
  });
  it("rejects the whole multi-role batch if a review is stale", async () => {
    const f = await setup();
    const second = await withTenant(f.schoolId, tx => tx.role.create({ data: { schoolId: f.schoolId, name: "Accountant", key: "accountant", isSystem: true } }));
    await expect(withTenant(f.schoolId, tx => apply(tx, { ...f.input, roles: [...f.input.roles, { roleId: second.id, revision: "0".repeat(64), permissionKeys: ["finance:read"] }] }))).rejects.toMatchObject({ code: "ROLE_UPGRADE_CONFLICT" });
    expect(await withTenant(f.schoolId, tx => tx.rolePermission.count({ where: { roleId: f.principal.id } }))).toBe(2);
  });
  it("rejects additions outside the review and duplicate requests", async () => {
    const f = await setup();
    await expect(withTenant(f.schoolId, tx => apply(tx, { ...f.input, roles: [{ ...f.input.roles[0], permissionKeys: ["students:delete"] }] }))).rejects.toMatchObject({ code: "INVALID_ROLE_UPGRADE" });
    await expect(withTenant(f.schoolId, tx => apply(tx, { ...f.input, roles: [...f.input.roles, ...f.input.roles] }))).rejects.toThrow(/only once/);
  });
  it("rechecks Owner activity and explicit role-control denial when applying", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => tx.user.update({ where: { id: f.ownerId }, data: { status: "suspended" } }));
    await expect(withTenant(f.schoolId, tx => apply(tx, f.input))).rejects.toMatchObject({ status: 403 });
    await withTenant(f.schoolId, async tx => {
      await tx.user.update({ where: { id: f.ownerId }, data: { status: "active" } });
      await tx.userPermissionOverride.create({ data: { schoolId: f.schoolId, userId: f.ownerId, permissionId: f.permissionIds.get("settings:manage_roles")!, granted: false } });
    });
    await expect(withTenant(f.schoolId, tx => apply(tx, f.input))).rejects.toMatchObject({ status: 403 });
  });
});
