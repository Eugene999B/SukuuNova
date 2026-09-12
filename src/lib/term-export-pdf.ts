import { PDFDocument, StandardFonts } from "pdf-lib";

export async function buildTermSummaryPdf(title: string, subtitle: string, rows: Array<{ label: string; value: string }>) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;

  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 790;
  };
  const line = (text: string, size = 10, isBold = false) => {
    if (y < 55) addPage();
    page.drawText(text.slice(0, 100), { x: 48, y, size, font: isBold ? bold : regular });
    y -= size + 9;
  };

  line(title, 18, true);
  line(subtitle, 10);
  y -= 8;
  for (const row of rows) {
    line(row.label, 9, true);
    line(row.value || "-", 10);
    y -= 4;
  }

  return pdf.save();
}
