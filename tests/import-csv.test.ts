import { describe, expect, it } from "vitest";
import { CsvImportError, normalizeImportHeader, parseCsvImport } from "../src/lib/import/csv";

describe("CSV import parser", () => {
  it("parses quoted commas, escaped quotes and blank lines", () => {
    const parsed = parseCsvImport('Name,Class,Note\n"Owusu, Ama",JHS 1,"She said ""hello"""\n\nKojo,JHS 2,Ready\n');
    expect(parsed.normalizedHeaders).toEqual(["name", "class", "note"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].record).toEqual({ name: "Owusu, Ama", class: "JHS 1", note: 'She said "hello"' });
    expect(parsed.rows[1].rowNumber).toBe(4);
  });

  it("handles UTF-8 BOM and CRLF without polluting the first header", () => {
    const parsed = parseCsvImport('\uFEFFStudent Name,Admission No\r\nAma Mensah,SN-001\r\n');
    expect(parsed.headers).toEqual(["Student Name", "Admission No"]);
    expect(parsed.normalizedHeaders).toEqual(["student_name", "admission_no"]);
    expect(parsed.rows[0].record.admission_no).toBe("SN-001");
  });

  it("normalizes common header punctuation deterministically", () => {
    expect(normalizeImportHeader(" Guardian Phone # ")).toBe("guardian_phone");
    expect(normalizeImportHeader("Parent & Guardian")).toBe("parent_and_guardian");
  });

  it("rejects duplicate headers after normalization", () => {
    expect(() => parseCsvImport("Guardian Phone,guardian-phone\n0240000000,0240000001"))
      .toThrowError(CsvImportError);
    try {
      parseCsvImport("Guardian Phone,guardian-phone\n0240000000,0240000001");
    } catch (error) {
      expect(error).toMatchObject({ code: "CSV_DUPLICATE_HEADERS", rowNumber: 1 });
    }
  });

  it("rejects uneven rows instead of silently shifting columns", () => {
    expect(() => parseCsvImport("Name,Class,Phone\nAma,JHS 1\n"))
      .toThrow(/expected 3/i);
  });

  it("rejects unclosed quoted fields", () => {
    expect(() => parseCsvImport('Name,Note\nAma,"unfinished'))
      .toThrow(/unclosed quoted field/i);
  });

  it("rejects null bytes", () => {
    expect(() => parseCsvImport("Name\nAma\0Mensah"))
      .toThrow(/null bytes/i);
  });
});
