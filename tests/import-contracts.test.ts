import { describe, expect, it } from "vitest";
import { importContract, suggestColumnMapping, validateColumnMapping } from "../src/lib/import/contracts";

const headers = ["student_name", "admission_no", "class", "parent_name", "parent_phone"];

describe("import contracts", () => {
  it("suggests student mappings only from declared exact aliases", () => {
    expect(suggestColumnMapping("students", headers)).toEqual({
      name: "student_name",
      admissionNo: "admission_no",
      dob: null,
      className: "class",
      guardianName: "parent_name",
      guardianPhone: "parent_phone",
      guardianRelationship: null,
    });
  });

  it("does not fuzzy-map unrelated columns", () => {
    const mapping = suggestColumnMapping("students", ["person", "identifier", "group"]);
    expect(mapping.name).toBeNull();
    expect(mapping.admissionNo).toBeNull();
    expect(mapping.className).toBeNull();
  });

  it("requires mandatory contract fields to be mapped", () => {
    const result = validateColumnMapping("students", headers, {
      name: null,
      admissionNo: "admission_no",
      className: "class",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Learner name must be mapped.");
  });

  it("rejects one CSV column being mapped to multiple fields", () => {
    const result = validateColumnMapping("guardians", ["name", "phone"], {
      name: "name",
      phone: "phone",
      email: "phone",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => /more than one field/i.test(error))).toBe(true);
  });

  it("exposes every supported import contract", () => {
    for (const kind of ["students", "guardians", "staff", "classes", "subjects", "opening_balances"] as const) {
      const contract = importContract(kind);
      expect(contract?.kind).toBe(kind);
      expect(contract?.fields.length).toBeGreaterThan(0);
    }
    expect(importContract("unknown")).toBeNull();
  });
});
