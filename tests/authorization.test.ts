import { describe, expect, it } from "vitest";
import {
  isTeachingRoleKey,
  resolveSchoolWorkspace,
  roleKeyForName,
} from "../src/lib/authorization";

describe("school authorization role model", () => {
  it("maps system role names to stable keys", () => {
    expect(roleKeyForName("Class Teacher")).toBe("class_teacher");
    expect(roleKeyForName("Subject Teacher")).toBe("subject_teacher");
    expect(roleKeyForName("Principal")).toBe("principal");
  });

  it("routes pure teaching roles to the Teacher workspace", () => {
    expect(resolveSchoolWorkspace(["teacher"])).toBe("teacher");
    expect(resolveSchoolWorkspace(["class_teacher"])).toBe("teacher");
    expect(resolveSchoolWorkspace(["subject_teacher"])).toBe("teacher");
  });

  it("routes leadership roles to the School workspace even with teaching roles", () => {
    expect(resolveSchoolWorkspace(["principal", "class_teacher"])).toBe("school");
    expect(resolveSchoolWorkspace(["department_head", "subject_teacher"])).toBe("school");
    expect(resolveSchoolWorkspace(["accountant", "class_teacher"])).toBe("school");
  });

  it("does not infer a teaching security role from arbitrary display names", () => {
    expect(isTeachingRoleKey("senior_biology_teacher")).toBe(false);
    expect(isTeachingRoleKey("class_teacher")).toBe(true);
  });
});
