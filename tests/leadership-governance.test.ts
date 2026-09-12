import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, type Fixture } from "./helpers";
import { setRolePermissions, setUserRoles, setUserPermissionOverride } from "../src/lib/school-services";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/default-rbac";
import { permissionLabel } from "../src/lib/permission-catalog";

const session = vi.hoisted(() => ({ schoolId: "", userId: "" }));
vi.mock("@/lib/school-auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));
import { createStaff } from "../src/app/school/staff/actions";

describe("leadership governance", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createTenantFixture();
    session.schoolId = fixture.schoolId;
    session.userId = fixture.ownerId;
    await withTenant(fixture.schoolId, (tx) => tx.role.update({
      where: { id: fixture.ownerRoleId }, data: { key: "owner" }
    }));
  });

  async function grantManagement() {
    await withTenant(fixture.schoolId, async (tx) => {
      for (const key of ["settings:manage_roles", "users:write"]) {
        await tx.userPermissionOverride.create({
          data: { schoolId: fixture.schoolId, userId: fixture.memberId,
            permissionId: fixture.permissionIds.get(key)!, granted: true }
        });
      }
    });
  }

  it("blocks non-Owners from assigning ownership, changing Owner rights, or overriding the Owner", async () => {
    await grantManagement();
    const common = { schoolId: fixture.schoolId, actorId: fixture.memberId };
    await expect(setUserRoles({ ...common, userId: fixture.memberId, roleIds: [fixture.ownerRoleId] }))
      .rejects.toMatchObject({ status: 403 });
    await expect(setRolePermissions({ ...common, roleId: fixture.ownerRoleId, permissionKeys: [] }))
      .rejects.toMatchObject({ status: 403 });
    await expect(setUserPermissionOverride({ ...common, userId: fixture.ownerId, permissionKey: "users:write", granted: false }))
      .rejects.toMatchObject({ status: 403 });
  });

  it("blocks permission escalation through shared service mutations", async () => {
    await grantManagement();
    const common = { schoolId: fixture.schoolId, actorId: fixture.memberId };
    await expect(setRolePermissions({ ...common, roleId: fixture.testRoleId, permissionKeys: ["finance:approve"] }))
      .rejects.toMatchObject({ status: 403 });
    await expect(setUserPermissionOverride({ ...common, userId: fixture.memberId, permissionKey: "finance:approve", granted: true }))
      .rejects.toMatchObject({ status: 403 });
  });

  it("preserves a school's restricted staff role when adding another staff member", async () => {
    const role = await withTenant(fixture.schoolId, (tx) => tx.role.create({
      data: { schoolId: fixture.schoolId, name: "Principal", key: "principal", isSystem: true }
    }));
    const form = new FormData();
    form.set("name", "New principal");
    form.set("phone", `024${Date.now().toString().slice(-7)}`);
    form.set("staffCategory", "Leadership");
    form.set("role", "Principal");
    const result = await createStaff(form);
    expect(result.ok).toBe(true);
    expect(await withTenant(fixture.schoolId, (tx) => tx.rolePermission.count({ where: { roleId: role.id } }))).toBe(0);
  });

  it("does not let a staff manager assign a stronger leadership preset", async () => {
    await grantManagement();
    session.userId = fixture.memberId;
    const form = new FormData();
    form.set("name", "Unauthorized principal");
    form.set("phone", `025${Date.now().toString().slice(-7)}`);
    form.set("staffCategory", "Leadership");
    form.set("role", "Principal");
    expect((await createStaff(form)).ok).toBe(false);
    expect(await withTenant(fixture.schoolId, (tx) => tx.user.count({ where: { name: "Unauthorized principal" } }))).toBe(0);
  });

  it("gives new leadership roles operational rights and labels every known permission", () => {
    for (const name of ["Administrator", "Principal"]) {
      expect(DEFAULT_ROLE_PERMISSIONS[name]).toEqual(expect.arrayContaining(["users:write", "settings:manage_roles", "roles:create_custom", "report_cards:approve"]));
      expect(DEFAULT_ROLE_PERMISSIONS[name]).not.toContain("students:delete");
    }
    for (const key of DEFAULT_PERMISSIONS) expect(permissionLabel(key)).not.toContain(":");
  });
});