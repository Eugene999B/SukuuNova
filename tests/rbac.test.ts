import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { hasPermission, requirePermission } from "../src/lib/rbac";
import { createTenantFixture, type Fixture } from "./helpers";

describe("database-driven RBAC", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createTenantFixture();
  });

  it("returns 403 semantics when a user lacks a permission", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      expect(await hasPermission(tx, fixture.memberId, "students:read")).toBe(false);
      await expect(requirePermission(tx, fixture.memberId, "students:read")).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN"
      });
    });
  });

  it("respects a granting override even when no role grants access", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const permissionId = fixture.permissionIds.get("students:read")!;
      await tx.userPermissionOverride.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: true }
      });
      expect(await hasPermission(tx, fixture.memberId, "students:read")).toBe(true);
    });
  });

  it("lets an explicit denial override a role grant", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const permissionId = fixture.permissionIds.get("finance:read")!;
      await tx.rolePermission.create({ data: { schoolId: fixture.schoolId, roleId: fixture.testRoleId, permissionId } });
      await tx.userRole.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, roleId: fixture.testRoleId } });
      expect(await hasPermission(tx, fixture.memberId, "finance:read")).toBe(true);
      await tx.userPermissionOverride.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: false }
      });
      expect(await hasPermission(tx, fixture.memberId, "finance:read")).toBe(false);
    });
  });
});
