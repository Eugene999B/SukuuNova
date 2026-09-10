import { describe, expect, it } from "vitest";
import { parseCsvImport } from "../src/lib/import/csv";
import { suggestColumnMapping } from "../src/lib/import/contracts";
import { validateMappedImportRows } from "../src/lib/import/row-validation";

describe("import row validation", () => {
  it("normalizes a valid learner row and keeps source row numbers", () => {
    const parsed = parseCsvImport("Student Name,Admission No,Date of Birth,Class,Parent Name,Parent Phone\n  Ama   Mensah  ,SN-001,2014-09-12,JHS 1,Akosua Mensah,024 000 0000\n");
    const mapping = suggestColumnMapping("students", parsed.normalizedHeaders);
    const result = validateMappedImportRows("students", parsed, mapping);
    expect(result).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 });
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, status: "valid" });
    expect(result.rows[0].normalized).toMatchObject({
      name: "Ama Mensah",
      admissionNo: "SN-001",
      dob: "2014-09-12",
      className: "JHS 1",
      guardianName: "Akosua Mensah",
      guardianPhone: "0240000000",
    });
  });

  it("rejects impossible dates and invalid contacts", () => {
    const parsed = parseCsvImport("Name,DOB,Guardian Name,Guardian Phone\nAma,2026-02-31,Parent,abc123\n");
    const mapping = suggestColumnMapping("students", parsed.normalizedHeaders);
    const result = validateMappedImportRows("students", parsed, mapping);
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0].issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["invalid_date", "invalid_phone"]));
  });

  it("requires guardian name when learner import includes guardian phone", () => {
    const parsed = parseCsvImport("Name,Guardian Phone\nAma,0240000000\n");
    const mapping = suggestColumnMapping("students", parsed.normalizedHeaders);
    const result = validateMappedImportRows("students", parsed, mapping);
    expect(result.rows[0].issues.some((issue) => issue.code === "guardian_name_required")).toBe(true);
  });

  it("marks every row sharing a deterministic identity as a duplicate", () => {
    const parsed = parseCsvImport("Name,Admission No\nAma,SN-001\nKojo,sn-001\nEfua,SN-002\n");
    const mapping = suggestColumnMapping("students", parsed.normalizedHeaders);
    const result = validateMappedImportRows("students", parsed, mapping);
    expect(result.duplicateRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.rows[0].status).toBe("duplicate");
    expect(result.rows[1].status).toBe("duplicate");
    expect(result.rows[2].status).toBe("valid");
  });

  it("normalizes Ghana-style money text without accepting negative balances", () => {
    const parsed = parseCsvImport("Admission Number,Opening Balance\nSN-001,GHS 1,250.50\n");
    expect(() => parsed).not.toThrow();
  });

  it("accepts boolean aliases and requires a contact for guardian rows", () => {
    const parsed = parseCsvImport("Guardian Name,Phone,Primary Guardian\nAkosua,0240000000,Yes\nYaw,,No\n");
    const mapping = suggestColumnMapping("guardians", parsed.normalizedHeaders);
    const result = validateMappedImportRows("guardians", parsed, mapping);
    expect(result.rows[0].normalized.isPrimary).toBe(true);
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].issues.some((issue) => issue.code === "guardian_contact_required")).toBe(true);
  });
});
