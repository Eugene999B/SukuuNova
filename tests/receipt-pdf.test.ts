import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildReceiptPdf, receiptCsvCell } from "../src/lib/receipt-pdf";

describe("receipt output", () => {
  it("prints Ghanaian characters and wraps long multi-page receipts", async () => {
    const bytes = await buildReceiptPdf([
      { text: "Ɛsi Ɔpoku — Eugene Academy", size: 18 },
      { text: "VeryLongLearnerName".repeat(20) },
      ...Array.from({ length: 100 }, (_, index) => ({ text: `Charge ${index + 1}: GHS 12.00` })),
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });
  it("neutralizes spreadsheet formulas without corrupting normal names", () => {
    expect(receiptCsvCell("=HYPERLINK(test)")).toBe('"\'=HYPERLINK(test)"');
    expect(receiptCsvCell("  +SUM(A1:A3)")).toBe('"\'  +SUM(A1:A3)"');
    expect(receiptCsvCell('Esi "A"')).toBe('"Esi ""A"""');
  });
});
