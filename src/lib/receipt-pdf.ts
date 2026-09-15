import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

export type ReceiptPrintLine = { text: string; size?: number };
export async function buildReceiptPdf(lines: ReceiptPrintLine[]) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf")), { subset: true });
  const width = 595.28, height = 841.89, margin = 48;
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  // Character-level wrapping also handles long unbroken admission numbers and names.
  for (const item of lines) {
    const size = item.size ?? 10;
    const leading = size * 1.5;
    const draw = (text: string) => {
      if (y - leading < margin) { page = pdf.addPage([width, height]); y = height - margin; }
      page.drawText(text, { x: margin, y: y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= leading;
    };
    for (const paragraph of item.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").split(/\r?\n/)) {
      let line = "";
      for (const character of paragraph) {
        if (line && font.widthOfTextAtSize(line + character, size) > width - margin * 2) { draw(line); line = ""; }
        line += character;
      }
      draw(line);
    }
    y -= 5;
  }
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => sheet.drawText(`Page ${index + 1} of ${pages.length}`, { x: margin, y: 23, size: 8, font }));
  return pdf.save();
}

export function receiptCsvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
