import { describe, expect, it } from "vitest";
import { resolveSchoolWorkspace } from "../src/lib/authorization";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/default-rbac";
import { permissionRisk } from "../src/lib/permission-catalog";

describe("Clinic health centre access model", () => {
  it("routes a pure School Nurse account into the clinic workspace", () => {
    expect(resolveSchoolWorkspace(["school_nurse"])).toBe("clinic");
  });

  it("keeps elevated leadership in the school workspace even if a nurse role is also assigned", () => {
    expect(resolveSchoolWorkspace(["school_nurse", "owner"])).toBe("school");
    expect(resolveSchoolWorkspace(["administrator", "school_nurse"])).toBe("school");
  });

  it("does not grant clinical care or records to management roles by default", () => {
    for (const roleName of ["Owner", "Administrator", "Principal", "Vice Principal"]) {
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).toContain("clinic:overview");
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).toContain("clinic:nurses_manage");
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).not.toContain("clinic:care");
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).not.toContain("clinic:records");
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).not.toContain("clinic:inventory");
      expect(DEFAULT_ROLE_PERMISSIONS[roleName]).not.toContain("clinic:export");
    }
  });

  it("gives School Nurse the clinical workspace permissions without management access", () => {
    const nurse = DEFAULT_ROLE_PERMISSIONS["School Nurse"];
    expect(nurse).toEqual(expect.arrayContaining(["clinic:care", "clinic:records", "clinic:inventory", "clinic:export"]));
    expect(nurse).not.toContain("clinic:overview");
    expect(nurse).not.toContain("clinic:nurses_manage");
  });

  it("registers clinic keys in the global permission catalogue and marks health operations sensitive", () => {
    expect(DEFAULT_PERMISSIONS).toEqual(expect.arrayContaining(["clinic:overview", "clinic:nurses_manage", "clinic:care", "clinic:records", "clinic:inventory", "clinic:export"]));
    expect(permissionRisk("clinic:overview")).toBe("standard");
    expect(permissionRisk("clinic:records")).toBe("sensitive");
    expect(permissionRisk("clinic:export")).toBe("sensitive");
  });
});
