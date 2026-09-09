import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, type Fixture } from "./helpers";

const session = vi.hoisted(() => ({ schoolId: "", userId: "" }));
vi.mock("@/lib/auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));
vi.mock("@/lib/identity-card-service", () => ({ ensureIdentityCardsForSchool: vi.fn() }));
import { PATCH } from "../src/app/api/school/access/route";

describe("school account update security", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createTenantFixture();
    session.schoolId = fixture.schoolId;
    session.userId = fixture.ownerId;
    await withTenant(fixture.schoolId, (tx) => tx.role.update({
      where: { id: fixture.ownerRoleId }, data: { key: "owner" }
    }));
  });

  async function patch(data: Record<string, unknown>) {
    return PATCH(new Request("http://localhost/api/school/access", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: fixture.memberId, status: "active", ...data })
    }));
  }

  it("returns only public account fields and forces a changed temporary password to be replaced", async () => {
    const response = await patch({ password: randomBytes(24).toString("base64url") });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["id", "name", "email", "phone", "status", "needsPasswordChange"].sort());
    expect(body.needsPasswordChange).toBe(true);
    const saved = await withTenant(fixture.schoolId, (tx) => tx.user.findUniqueOrThrow({
      where: { id: fixture.memberId }, select: { needsPasswordChange: true }
    }));
    expect(saved.needsPasswordChange).toBe(true);
  });

  it("rejects clearing a denial when the actor cannot grant that permission", async () => {
    session.userId = fixture.memberId;
    await withTenant(fixture.schoolId, async (tx) => {
      for (const key of ["users:write", "roles:create_custom"]) {
        await tx.userPermissionOverride.create({
          data: { schoolId: fixture.schoolId, userId: fixture.memberId,
            permissionId: fixture.permissionIds.get(key)!, granted: true }
        });
      }
      const permissionId = fixture.permissionIds.get("finance:approve")!;
      await tx.rolePermission.create({
        data: { schoolId: fixture.schoolId, roleId: fixture.testRoleId, permissionId }
      });
      await tx.userRole.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, roleId: fixture.testRoleId }
      });
      await tx.userPermissionOverride.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: false }
      });
    });
    const response = await patch({ clearPermissionOverrides: true, name: "Must roll back" });
    expect(response.status).toBe(403);
    await withTenant(fixture.schoolId, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: fixture.memberId } });
      expect(user.name).toBe("Fixture Member");
      const denial = await tx.userPermissionOverride.findUniqueOrThrow({
        where: { userId_permissionId: {
          userId: fixture.memberId, permissionId: fixture.permissionIds.get("finance:approve")!
        } }
      });
      expect(denial.granted).toBe(false);
    });
  });

  it("allows the Owner to clear a direct denial", async () => {
    await withTenant(fixture.schoolId, (tx) => tx.userPermissionOverride.create({
      data: { schoolId: fixture.schoolId, userId: fixture.memberId,
        permissionId: fixture.permissionIds.get("finance:approve")!, granted: false }
    }));
    expect((await patch({ clearPermissionOverrides: true })).status).toBe(200);
    expect(await withTenant(fixture.schoolId, (tx) => tx.userPermissionOverride.count({
      where: { userId: fixture.memberId }
    }))).toBe(0);
  });
});
