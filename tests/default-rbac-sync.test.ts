import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { syncDefaultRbac, updateCustomRole, deleteCustomRole, customRoleBuilderData } from "../src/lib/role-builder-service";
import { getSchoolAuthorization } from "../src/lib/authorization";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/default-rbac";
import { createTenantFixture } from "./helpers";

describe("safe default role synchronization", () => {
  it("does not turn a custom Owner name into ownership or grant baseline rights", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      const role = await tx.role.create({
        data: { schoolId: fixture.schoolId, name: "Owner", key: "custom_owner", isSystem: false }
      });
      await tx.userRole.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, roleId: role.id }
      });
      await syncDefaultRbac(tx, fixture.schoolId);
      const preserved = await tx.role.findUniqueOrThrow({
        where: { id: role.id }, include: { rolePermissions: true }
      });
      expect(preserved.key).toBe("custom_owner");
      expect(preserved.isSystem).toBe(false);
      expect(preserved.rolePermissions).toHaveLength(0);
      expect((await getSchoolAuthorization(tx, fixture.memberId)).isOwner).toBe(false);
    });
  });

  it("preserves deliberate system-role restrictions and direct denials", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      const role = await tx.role.create({
        data: { schoolId: fixture.schoolId, name: "Principal", key: "principal", isSystem: true }
      });
      const permissionId = fixture.permissionIds.get("students:read")!;
      await tx.rolePermission.create({
        data: { schoolId: fixture.schoolId, roleId: role.id, permissionId }
      });
      await tx.userPermissionOverride.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: false }
      });
      await syncDefaultRbac(tx, fixture.schoolId);
      const rights = await tx.rolePermission.findMany({ where: { roleId: role.id } });
      expect(rights.map((right) => right.permissionId)).toEqual([permissionId]);
      const denial = await tx.userPermissionOverride.findUniqueOrThrow({
        where: { userId_permissionId: { userId: fixture.memberId, permissionId } }
      });
      expect(denial.granted).toBe(false);
    });
  });

  it("creates missing system roles with baseline rights and is repeatable", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await syncDefaultRbac(tx, fixture.schoolId);
      await syncDefaultRbac(tx, fixture.schoolId);
      const role = await tx.role.findUniqueOrThrow({
        where: { schoolId_name: { schoolId: fixture.schoolId, name: "Principal" } },
        include: { rolePermissions: { include: { permission: true } } }
      });
      expect(role.isSystem).toBe(true);
      expect(role.key).toBe("principal");
      expect(role.rolePermissions.map((right) => right.permission.key).sort())
        .toEqual([...new Set(DEFAULT_ROLE_PERMISSIONS.Principal)].sort());
    });
  });
});

describe("ownership roles with legacy custom metadata", () => {
  it.each(["owner", null, ""])("protects ownership when key is %s and the system flag is missing", async key => {
    const f = await createTenantFixture();
    const role = await withTenant(f.schoolId, async tx => {
      const created = await tx.role.create({ data: { schoolId: f.schoolId, name: "Owner", key, isSystem: false } });
      await tx.userRole.create({ data: { schoolId: f.schoolId, userId: f.memberId, roleId: created.id } });
      return created;
    });
    const input = { schoolId: f.schoolId, actorId: f.ownerId, roleId: role.id };
    await expect(withTenant(f.schoolId, tx => updateCustomRole(tx, { ...input, name: "Renamed", permissionKeys: [] }))).rejects.toMatchObject({ code: "SYSTEM_ROLE_PROTECTED" });
    await expect(withTenant(f.schoolId, tx => deleteCustomRole(tx, input))).rejects.toMatchObject({ code: "SYSTEM_ROLE_PROTECTED" });
    const result = await withTenant(f.schoolId, async tx => ({
      access: await getSchoolAuthorization(tx, f.memberId),
      builder: await customRoleBuilderData(tx, f.ownerId),
    }));
    expect(result.access.isOwner).toBe(true);
    expect(result.builder.roles.some(item => item.id === role.id)).toBe(false);
  });
  it("keeps an ordinary custom Owner-named role editable without granting ownership", async () => {
    const f = await createTenantFixture();
    const role = await withTenant(f.schoolId, async tx => {
      const created = await tx.role.create({ data: { schoolId: f.schoolId, name: "Owner", key: "custom_owner", isSystem: false } });
      await tx.userRole.create({ data: { schoolId: f.schoolId, userId: f.memberId, roleId: created.id } });
      return created;
    });
    await withTenant(f.schoolId, tx => updateCustomRole(tx, { schoolId: f.schoolId, actorId: f.ownerId, roleId: role.id, name: "Office helpers", permissionKeys: ["students:read"] }));
    expect((await withTenant(f.schoolId, tx => getSchoolAuthorization(tx, f.memberId))).isOwner).toBe(false);
    await withTenant(f.schoolId, tx => deleteCustomRole(tx, { schoolId: f.schoolId, actorId: f.ownerId, roleId: role.id }));
    expect(await withTenant(f.schoolId, tx => tx.role.count({ where: { id: role.id } }))).toBe(0);
  });
});
