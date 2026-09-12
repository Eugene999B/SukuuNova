import { describe, expect, it } from "vitest";
import { dossierCsv, dossierDocx, dossierPdf, dossierXlsx, type PersonDossier } from "../src/lib/dossier-report";
import { hardenDossierForExport } from "../src/lib/dossier-export-hardening";
import { createDocx, createStoredZip, createXlsx } from "../src/lib/ooxml";

const dossier: PersonDossier = {
  kind: "student",
  filenameBase: "ama-mensah-student-dossier",
  title: "Ama & Mensah <Student> Dossier",
  subtitle: "Eugene Academy (EUG001)",
  schoolName: "Eugene Academy",
  schoolCode: "EUG001",
  generatedAt: "2026-09-12T12:00:00.000Z",
  summary: [
    { label: "Academic average", value: "82.5%", hint: "10 normalized scores" },
    { label: "Spreadsheet safety", value: "=2+2", hint: "+SUM(A1:A2)" },
  ],
  sections: [
    {
      title: "Identity / overview:*?[]",
      note: "Uses <escaped> & safe XML text.",
      rows: [["Full name", "Ama & Mensah"]],
      table: { headers: ["Field", "Value"], rows: [["Formula-looking text", "@guardian"]] },
    },
  ],
};

function zipText(buffer: Buffer) {
  return buffer.toString("utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Dossier report formats", () => {
  it("creates standards-shaped DOCX and escapes user text", () => {
    const docx = dossierDocx(dossier);
    expect(docx.subarray(0, 2).toString("ascii")).toBe("PK");
    const text = zipText(docx);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("word/document.xml");
    expect(text).toContain("word/styles.xml");
    expect(text).toContain("Ama &amp; Mensah &lt;Student&gt; Dossier");
    expect(text).not.toContain("Ama & Mensah <Student> Dossier");
  });

  it("creates standards-shaped XLSX using inline strings instead of executable formulas", () => {
    const xlsx = dossierXlsx(dossier);
    expect(xlsx.subarray(0, 2).toString("ascii")).toBe("PK");
    const text = zipText(xlsx);
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("xl/styles.xml");
    expect(text).toContain("t=\"inlineStr\"");
    expect(text).toContain("=2+2");
    expect(text).not.toContain("<f>2+2</f>");
  });

  it("sanitizes formula-looking cells in CSV exports", () => {
    const csv = dossierCsv(dossier);
    expect(csv).toContain("\"'=2+2\"");
    expect(csv).toContain("\"'+SUM(A1:A2)\"");
    expect(csv).toContain("\"'@guardian\"");
  });

  it("creates a real PDF payload", async () => {
    const pdf = await dossierPdf(dossier);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });
});

describe("Dossier export hardening", () => {
  it("excludes invalid assessment maxima and recomputes normalized academic indicators", () => {
    const target = clone(dossier);
    target.summary = [
      { label: "Academic average", value: "999%" },
      { label: "Recent trend", value: "Wrong" },
      { label: "Outstanding fees", value: "GHS 0.00" },
    ];
    target.sections = [
      { title: "Intelligence summary", rows: [["Academic average", "999%"], ["Recent performance trend", "Wrong"], ["Trend context", "Wrong"], ["Net fees billed", "GHS 0.00"], ["Net payments", "GHS 0.00"], ["Outstanding balance", "GHS 0.00"]] },
      { title: "Academic performance history", table: { headers: ["Recorded", "Subject", "Assessment", "Type", "Score", "Maximum", "Percent"], rows: [["1", "Math", "Quiz", "CA", "40", "50", "999%"], ["2", "Science", "Bad import", "CA", "30", "0", "30%"]] } },
      { title: "Finance history", table: { headers: ["Created", "Term", "Invoice", "Payable", "Net paid", "Balance", "Status"], rows: [] } },
    ];
    const hardened = hardenDossierForExport(target);
    const academic = hardened.sections.find((section) => section.title === "Academic performance history")!.table!;
    expect(academic.rows[0][6]).toBe("80.0%");
    expect(academic.rows[1][6]).toBe("-");
    expect(hardened.summary.find((item) => item.label === "Academic average")?.value).toBe("80.0%");
  });

  it("clamps negative net payments and recomputes finance balances", () => {
    const target = clone(dossier);
    target.summary = [{ label: "Outstanding fees", value: "GHS 999.00" }];
    target.sections = [
      { title: "Intelligence summary", rows: [["Net fees billed", "GHS 0.00"], ["Net payments", "GHS -50.00"], ["Outstanding balance", "GHS 0.00"]] },
      { title: "Finance history", table: { headers: ["Created", "Term", "Invoice", "Payable", "Net paid", "Balance", "Status"], rows: [["1", "T1", "INV-1", "GHS 100.00", "GHS -50.00", "GHS 150.00", "partial"]] } },
    ];
    const hardened = hardenDossierForExport(target);
    const finance = hardened.sections.find((section) => section.title === "Finance history")!.table!;
    expect(finance.rows[0][4]).toBe("GHS 0.00");
    expect(finance.rows[0][5]).toBe("GHS 100.00");
    expect(hardened.summary.find((item) => item.label === "Outstanding fees")?.value).toBe("GHS 100.00");
  });
});

describe("Dependency-free OOXML builder", () => {
  it("writes a valid stored ZIP envelope and Office package entries", () => {
    const zip = createStoredZip([{ name: "hello.txt", data: "SukuuNova" }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.toString("utf8")).toContain("hello.txt");

    const docx = createDocx({ title: "Test", sections: [{ title: "One", rows: [["A", "B"]] }] });
    const xlsx = createXlsx([{ name: "Invalid:/\\*?[] very long sheet name that must be trimmed", rows: [["Header", "Value"], ["Row", 1]] }]);
    expect(zipText(docx)).toContain("_rels/.rels");
    expect(zipText(xlsx)).toContain("xl/_rels/workbook.xml.rels");
  });
});
