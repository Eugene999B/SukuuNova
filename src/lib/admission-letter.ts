import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { AdmissionApplicationRow } from "@/lib/admissions-v2";

export type AdmissionLetterSchool = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  brandColors?: unknown;
};

export function safeAdmissionLetterFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "admission-letter";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "—";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase()).join("") || "SN";
}

function brandHex(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "#173B57";
  const record = value as Record<string, unknown>;
  const candidate = [record.primary, record.primaryColor, record.brand, record.accent].find((item) => typeof item === "string" && /^#[0-9a-fA-F]{6}$/.test(item));
  return typeof candidate === "string" ? candidate : "#173B57";
}

function hexRgb(hex: string) {
  return rgb(Number.parseInt(hex.slice(1, 3), 16) / 255, Number.parseInt(hex.slice(3, 5), 16) / 255, Number.parseInt(hex.slice(5, 7), 16) / 255);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawParagraph(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, width: number, lineHeight = size * 1.55) {
  const lines = wrapText(text, font, size, width);
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color: rgb(0.1, 0.14, 0.2) });
    y -= lineHeight;
  }
  return y;
}

export async function buildAdmissionPdf(input: { school: AdmissionLetterSchool; application: AdmissionApplicationRow }) {
  const { school, application } = input;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const primary = hexRgb(brandHex(school.brandColors));
  const width = page.getWidth();
  const margin = 48;

  page.drawRectangle({ x: 0, y: page.getHeight() - 8, width, height: 8, color: primary });
  let logoDrawn = false;
  if (school.logoUrl?.startsWith("data:image/")) {
    const match = school.logoUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (match) {
      try {
        const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
        const image = match[1].toLowerCase() === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const scaled = image.scale(Math.min(1, 58 / Math.max(image.width, image.height)));
        page.drawImage(image, { x: margin, y: 747, width: scaled.width, height: scaled.height });
        logoDrawn = true;
      } catch {
        logoDrawn = false;
      }
    }
  }
  if (!logoDrawn) {
    page.drawCircle({ x: margin + 28, y: 775, size: 27, borderColor: primary, borderWidth: 1.8, color: rgb(0.98, 0.99, 1) });
    const mark = initials(school.name);
    page.drawText(mark, { x: margin + 28 - bold.widthOfTextAtSize(mark, 13) / 2, y: 770, size: 13, font: bold, color: primary });
  }

  const schoolTitle = school.name.toUpperCase();
  const schoolSize = schoolTitle.length > 38 ? 17 : 20;
  page.drawText(schoolTitle, { x: width / 2 - bold.widthOfTextAtSize(schoolTitle, schoolSize) / 2, y: 783, size: schoolSize, font: bold, color: primary });
  const sub = `OFFICIAL ADMISSION LETTER  •  SCHOOL CODE ${school.uniqueCode}`;
  page.drawText(sub, { x: width / 2 - regular.widthOfTextAtSize(sub, 8.5) / 2, y: 765, size: 8.5, font: regular, color: rgb(0.35, 0.4, 0.48) });
  page.drawLine({ start: { x: margin, y: 742 }, end: { x: width - margin, y: 742 }, thickness: 1.3, color: primary });

  page.drawText(`Reference: ${application.reference}`, { x: margin, y: 718, size: 9, font: bold, color: rgb(0.2, 0.25, 0.32) });
  const dateText = `Date: ${formatDate(application.offerIssuedAt ?? new Date())}`;
  page.drawText(dateText, { x: width - margin - bold.widthOfTextAtSize(dateText, 9), y: 718, size: 9, font: bold, color: rgb(0.2, 0.25, 0.32) });
  const heading = "LETTER OF ADMISSION";
  page.drawText(heading, { x: width / 2 - serifBold.widthOfTextAtSize(heading, 15) / 2, y: 681, size: 15, font: serifBold, color: rgb(0.08, 0.11, 0.16) });

  let y = 646;
  page.drawText(`Dear ${application.guardianName},`, { x: margin, y, size: 11.5, font: serif, color: rgb(0.1, 0.14, 0.2) });
  y -= 29;
  y = drawParagraph(page, `Following the review of the admission application, we are pleased to offer ${application.studentName} admission to ${school.name}.`, serif, 11.5, margin, y, width - margin * 2);
  y -= 14;

  const className = `${application.classLevel ? `${application.classLevel} · ` : ""}${application.className ?? application.intendedClassName ?? "Approved class"}`;
  const boxHeight = 122;
  page.drawRectangle({ x: margin, y: y - boxHeight + 14, width: width - margin * 2, height: boxHeight, color: rgb(0.968, 0.976, 0.985), borderColor: rgb(0.77, 0.8, 0.84), borderWidth: 0.7 });
  const details = [
    ["Learner", application.studentName],
    ["Class", className],
    ["Academic year", application.academicYearName ?? "—"],
    ["Entry term", application.termName ?? "—"],
    ["Admission / reporting date", formatDate(application.admissionDate)],
    ["Entry type", application.entryType],
  ];
  let detailY = y - 7;
  for (const [detailLabel, value] of details) {
    page.drawText(`${detailLabel}:`, { x: margin + 16, y: detailY, size: 9.5, font: bold, color: primary });
    page.drawText(String(value), { x: margin + 145, y: detailY, size: 9.5, font: regular, color: rgb(0.1, 0.14, 0.2) });
    detailY -= 17;
  }
  y -= boxHeight + 12;
  y = drawParagraph(page, `This offer is issued on the basis of the information supplied in the application and the school's admission requirements. The family is expected to complete all required school documentation, observe the school's policies and make the necessary arrangements for the learner's successful start.`, serif, 10.8, margin, y, width - margin * 2);
  y -= 12;
  if (application.decisionNote) {
    y = drawParagraph(page, `Admission note: ${application.decisionNote}`, serif, 10.8, margin, y, width - margin * 2);
    y -= 10;
  }
  y = drawParagraph(page, `We look forward to welcoming ${application.studentName} into our school community and supporting the learner's academic and personal development.`, serif, 10.8, margin, y, width - margin * 2);
  y -= 24;
  page.drawText("Yours faithfully,", { x: margin, y, size: 10.8, font: serif, color: rgb(0.1, 0.14, 0.2) });

  const signY = 105;
  page.drawLine({ start: { x: margin, y: signY }, end: { x: margin + 190, y: signY }, thickness: 0.7, color: rgb(0.2, 0.25, 0.32) });
  page.drawText("Head of School / Authorised Officer", { x: margin, y: signY - 14, size: 8.5, font: bold, color: rgb(0.2, 0.25, 0.32) });
  page.drawText("Signature & date", { x: margin, y: signY - 26, size: 8, font: regular, color: rgb(0.4, 0.45, 0.52) });
  page.drawLine({ start: { x: width - margin - 190, y: signY }, end: { x: width - margin, y: signY }, thickness: 0.7, color: rgb(0.2, 0.25, 0.32) });
  page.drawText("School Stamp", { x: width - margin - 190, y: signY - 14, size: 8.5, font: bold, color: rgb(0.2, 0.25, 0.32) });
  page.drawText("Official endorsement", { x: width - margin - 190, y: signY - 26, size: 8, font: regular, color: rgb(0.4, 0.45, 0.52) });
  page.drawText(`${application.reference} • Generated by SukuuNova`, { x: margin, y: 35, size: 7.5, font: regular, color: rgb(0.5, 0.54, 0.6) });
  return pdf.save();
}

export function buildAdmissionWord(input: { school: AdmissionLetterSchool; application: AdmissionApplicationRow }) {
  const { school, application } = input;
  const className = `${application.classLevel ? `${application.classLevel} · ` : ""}${application.className ?? application.intendedClassName ?? "Approved class"}`;
  const logo = school.logoUrl
    ? `<img src="${escapeHtml(school.logoUrl)}" style="width:72px;height:72px;object-fit:contain" alt="School logo"/>`
    : `<div style="width:68px;height:68px;border:2px solid #173B57;border-radius:50%;text-align:center;line-height:68px;font:bold 15px Arial;color:#173B57">${escapeHtml(initials(school.name))}</div>`;
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(application.reference)}</title><style>@page{size:A4;margin:22mm}body{font-family:Georgia,'Times New Roman',serif;color:#172033;font-size:12pt;line-height:1.65}.head{width:100%;border-bottom:3px double #173B57;padding-bottom:14px}.school{text-align:center}.school h1{margin:0;font:700 20pt Arial,sans-serif;color:#173B57}.school p{margin:5px 0;font:700 8pt Arial,sans-serif;letter-spacing:1px}.meta{width:100%;margin:20px 0;font:700 9pt Arial,sans-serif}.title{text-align:center;text-decoration:underline;font-weight:bold;font-size:15pt;margin:24px 0}.box{border:1px solid #b8c0cc;background:#f7f9fb;padding:12px 16px;margin:20px 0;font:10pt Arial,sans-serif}.sign{width:100%;margin-top:55px}.sign td{width:50%;padding-top:8px;border-top:1px solid #172033;font:9pt Arial,sans-serif}</style></head><body><table class="head"><tr><td style="width:80px">${logo}</td><td class="school"><h1>${escapeHtml(school.name.toUpperCase())}</h1><p>OFFICIAL ADMISSION LETTER · SCHOOL CODE ${escapeHtml(school.uniqueCode)}</p></td><td style="width:80px"></td></tr></table><table class="meta"><tr><td>Reference: ${escapeHtml(application.reference)}</td><td style="text-align:right">Date: ${escapeHtml(formatDate(application.offerIssuedAt ?? new Date()))}</td></tr></table><div class="title">LETTER OF ADMISSION</div><p>Dear <b>${escapeHtml(application.guardianName)}</b>,</p><p>Following the review of the admission application, we are pleased to offer <b>${escapeHtml(application.studentName)}</b> admission to <b>${escapeHtml(school.name)}</b>.</p><div class="box"><b>Learner:</b> ${escapeHtml(application.studentName)}<br><b>Class:</b> ${escapeHtml(className)}<br><b>Academic year:</b> ${escapeHtml(application.academicYearName ?? "—")}<br><b>Entry term:</b> ${escapeHtml(application.termName ?? "—")}<br><b>Admission / reporting date:</b> ${escapeHtml(formatDate(application.admissionDate))}<br><b>Entry type:</b> ${escapeHtml(application.entryType)}</div><p>This offer is issued on the basis of the information supplied in the application and the school's admission requirements. The family is expected to complete all required school documentation, observe the school's policies and make the necessary arrangements for the learner's successful start.</p>${application.decisionNote ? `<p><b>Admission note:</b> ${escapeHtml(application.decisionNote)}</p>` : ""}<p>We look forward to welcoming <b>${escapeHtml(application.studentName)}</b> into our school community and supporting the learner's academic and personal development.</p><p>Yours faithfully,</p><table class="sign"><tr><td><b>Head of School / Authorised Officer</b><br>Signature &amp; date</td><td style="padding-left:35px"><b>School Stamp</b><br>Official endorsement</td></tr></table></body></html>`;
}
