import { describe, expect, it } from "vitest";
import { parseMarkSheetPaste } from "../src/lib/mark-sheet-input";

describe("spreadsheet mark paste", () => {
  it("maps CRLF rows from the selected learner and preserves blank row positions", () => {
    expect(parseMarkSheetPaste("7.5\r\n\r\n0\r\n", 2, 6, 10)).toEqual([
      { row: 2, value: "7.5", status: "present" }, { row: 4, value: "0", status: "present" }
    ]);
  });
  it("supports absent/excused shortcuts and an explicit status column", () => {
    expect(parseMarkSheetPaste("A\nE\n8\tpresent\n0\tabsent", 0, 4, 10)).toEqual([
      { row: 0, value: "0", status: "absent" }, { row: 1, value: "0", status: "excused" },
      { row: 2, value: "8", status: "present" }, { row: 3, value: "0", status: "absent" }
    ]);
  });
  it("rejects overflow and malformed cells before applying any changes", () => {
    for (const text of ["1\n2\n3", "2\n11", "2\n=SUM(A1)", "2\n-1", "2\n1,5", "2\nInfinity", "1\tunknown", "1\tconstructor", "1\t2\t3"]) {
      expect(() => parseMarkSheetPaste(text, 0, 2, 10)).toThrow();
    }
  });
  it("does not turn a blank present mark into zero or accept marks for absent learners", () => {
    expect(parseMarkSheetPaste("\n\n", 0, 2, 10)).toEqual([]);
    expect(() => parseMarkSheetPaste("\tpresent", 0, 2, 10)).toThrow();
    expect(() => parseMarkSheetPaste("4\texcused", 0, 2, 10)).toThrow();
  });
});
