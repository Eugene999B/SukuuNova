import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { lockSchoolAccess, requireOwnerContinuity } from "../src/lib/owner-governance";
import { setUserRoles } from "../src/lib/school-services";
import { createTenantFixture } from "./helpers";

describe("active Owner continuity", () => {
  async function fixtureWithOwners(two = false) {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.role.update({ where: { id: fixture.ownerRoleId }, data: { key: "owner" } });
      if (two) await tx.userRole.create({
        data: { schoolId: fixture.schoolId, userId: fixture.memberId, roleId: fixture.ownerRoleId }
      });
    });
    return fixture;
  }

  it("rejects removing the last active Owner through role assignment", async () => {
    const fixture = await fixtureWithOwners();
    await expect(setUserRoles({
      schoolId: fixture.schoolId, actorId: fixture.ownerId, userId: fixture.ownerId, roleIds: []
    })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects suspension or pending status for the last active Owner", async () => {
    const fixture = await fixtureWithOwners();
    for (const status of ["suspended", "pending"]) {
      await expect(withTenant(fixture.schoolId, async (tx) => {
        await lockSchoolAccess(tx, fixture.schoolId);
        await requireOwnerContinuity(tx, fixture.schoolId, fixture.ownerId, { status });
      })).rejects.toMatchObject({ status: 403 });
    }
  });

  it("allows an Owner handover when another active Owner remains", async () => {
    const fixture = await fixtureWithOwners(true);
    await setUserRoles({ schoolId: fixture.schoolId, actorId: fixture.ownerId, userId: fixture.ownerId, roleIds: [] });
    const roles = await withTenant(fixture.schoolId, (tx) => tx.userRole.findMany({ where: { roleId: fixture.ownerRoleId } }));
    expect(roles.map((role) => role.userId)).toEqual([fixture.memberId]);
  });

  it("serializes simultaneous self-removals so one active Owner survives", async () => {
    const fixture = await fixtureWithOwners(true);
    const results = await Promise.allSettled([fixture.ownerId, fixture.memberId].map((userId) =>
      setUserRoles({ schoolId: fixture.schoolId, actorId: userId, userId, roleIds: [] })
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await withTenant(fixture.schoolId, (tx) => tx.userRole.count({ where: { roleId: fixture.ownerRoleId } }))).toBe(1);
  });
});
