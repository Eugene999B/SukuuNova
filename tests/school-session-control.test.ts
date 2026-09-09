import { describe, expect, it } from "vitest";
import { authorizationVersion, type SchoolAuthorizationState } from "../src/lib/auth";

const base: SchoolAuthorizationState = {
  id: "user-1",
  schoolId: "school-1",
  name: "School Owner",
  status: "active",
  passwordHash: "hashed-password",
  schoolSessionEpoch: 0,
  userSessionEpoch: 0,
  userRoles: [{ role: { id: "role-owner", name: "Owner", key: "owner", rolePermissions: [{ permissionId: "perm-1" }] } }],
  permissionOverrides: [],
};

describe("school session revocation epochs", () => {
  it("keeps an authorization version stable while session epochs are unchanged", () => {
    expect(authorizationVersion(base)).toBe(authorizationVersion({ ...base }));
  });

  it("invalidates every school session when the school epoch changes", () => {
    expect(authorizationVersion({ ...base, schoolSessionEpoch: 1 })).not.toBe(authorizationVersion(base));
  });

  it("invalidates only the selected user authorization state when its user epoch changes", () => {
    expect(authorizationVersion({ ...base, userSessionEpoch: 3 })).not.toBe(authorizationVersion(base));
  });

  it("still invalidates sessions when roles or permissions change", () => {
    const changedRole = {
      ...base,
      userRoles: [{ role: { ...base.userRoles[0].role, rolePermissions: [{ permissionId: "perm-2" }] } }],
    };
    expect(authorizationVersion(changedRole)).not.toBe(authorizationVersion(base));
  });
});
