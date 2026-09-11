import encodeQR from "qr";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { IdentityCardView } from "./identity-card-service";
import { identityCardCompactVerificationUrl } from "./identity-card-compact-verification";
import { identityCardTheme, type IdentityCardTheme } from "./identity-card-themes";
import { AppError } from "./errors";

const PT_PER_MM = 72 / 25.4;
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 53.98;
const CARD_WIDTH = CR80_WIDTH_MM * PT_PER_MM;
const CARD_HEIGHT = CR80_HEIGHT_MM * PT_PER_MM;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const GAP_X = 10;
const GAP_Y = 10;
export const ID_CARD_PACK_LIMIT = 64;

export type SchoolIdentityBrand = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  brandColors: unknown;
};

export type IdentityCardArtworkSide = "front" | "back";

type Color = ReturnType<typeof rgb>;
type PdfTheme = IdentityCardTheme & {
  frontBackgroundRgb: Color;
  backBackgroundRgb: Color;
  primaryRgb: Color;
  accentRgb: Color;
  highlightRgb: Color;
  inkRgb: Color;
  mutedRgb: Color;
  surfaceRgb: Color;
  surfaceAltRgb: Color;
  lineRgb: Color;
  footerRgb: Color;
  footerInkRgb: Color;
  portraitBorderRgb: Color;
  qrInkRgb: Color;
};

type PdfAssets = {
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  portraits: Map<string, PDFImage>;
  qr: Map<string, unknown[][]>;
};

function hexRgb(value: string): Color {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return rgb(
    parseInt(normalized.slice(1, 3), 16) / 255,
    parseInt(normalized.slice(3, 5), 16) / 255,
    parseInt(normalized.slice(5, 7), 16) / 255,
  );
}

function pdfTheme(value: unknown): PdfTheme {
  const theme = identityCardTheme(value);
  return {
    ...theme,
    frontBackgroundRgb: hexRgb(theme.frontBackground),
    backBackgroundRgb: hexRgb(theme.backBackground),
    primaryRgb: hexRgb(theme.primary),
    accentRgb: hexRgb(theme.accent),
    highlightRgb: hexRgb(theme.highlight),
    inkRgb: hexRgb(theme.ink),
    mutedRgb: hexRgb(theme.muted),
    surfaceRgb: hexRgb(theme.surface),
    surfaceAltRgb: hexRgb(theme.surfaceAlt),
    lineRgb: hexRgb(theme.line),
    footerRgb: hexRgb(theme.footer),
    footerInkRgb: hexRgb(theme.footerInk),
    portraitBorderRgb: hexRgb(theme.portraitBorder),
    qrInkRgb: hexRgb(theme.qrInk),
  };
}

function dataImage(value: string | null | undefined) {
  if (!value?.startsWith("data:")) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 2_500_000) return null;
  return { mime: match[1].toLowerCase(), bytes };
}

async function embedImage(doc: PDFDocument, value: string | null | undefined) {
  const source = dataImage(value);
  if (!source) return null;
  try {
    return source.mime.includes("png") ? await doc.embedPng(source.bytes) : await doc.embedJpg(source.bytes);
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

function cardDate(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function short(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color: Color, minimum = 4) {
  const value = String(text || "-");
  let actual = size;
  while (actual > minimum && font.widthOfTextAtSize(value, actual) > width) actual -= .25;
  page.drawText(value, { x, y, size: actual, font, color, maxWidth: width });
}

function qrMatrix(value: string) {
  const raw = encodeQR(value, "raw", { ecc: "medium" }) as unknown;
  return Array.isArray(raw)
    ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>))
    : [];
}

function drawQr(page: PDFPage, matrix: unknown[][], x: number, y: number, size: number, theme: PdfTheme) {
  const count = matrix.length;
  if (!count) return;
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  page.drawRectangle({ x: x - 3, y: y - 3, width: size + 6, height: size + 6, color: rgb(1, 1, 1), borderColor: theme.lineRgb, borderWidth: .6 });
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        page.drawRectangle({
          x: x + (column + quiet) * unit,
          y: y + (count - row - 1 + quiet) * unit,
          width: unit + .025,
          height: unit + .025,
          color: theme.qrInkRgb,
        });
      }
    }
  }
}

function drawLogo(page: PDFPage, assets: PdfAssets, school: SchoolIdentityBrand, x: number, y: number, size: number, theme: PdfTheme, darkSurface = false) {
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: theme.highlightRgb, borderWidth: 1 });
  if (assets.logo) {
    const scale = Math.min((size - 5) / assets.logo.width, (size - 5) / assets.logo.height);
    const width = assets.logo.width * scale;
    const height = assets.logo.height * scale;
    page.drawImage(assets.logo, { x: x + (size - width) / 2, y: y + (size - height) / 2, width, height });
    return;
  }
  const mark = initials(school.name);
  const fontSize = size * .27;
  const width = assets.bold.widthOfTextAtSize(mark, fontSize);
  page.drawText(mark, { x: x + size / 2 - width / 2, y: y + size * .39, size: fontSize, font: assets.bold, color: darkSurface ? theme.primaryRgb : theme.primaryRgb });
}

function drawPortrait(page: PDFPage, assets: PdfAssets, card: IdentityCardView, x: number, y: number, width: number, height: number, theme: PdfTheme) {
  page.drawRectangle({ x: x - 2, y: y - 2, width: width + 4, height: height + 4, color: theme.portraitBorderRgb });
  page.drawRectangle({ x, y, width, height, color: theme.surfaceRgb });
  const image = assets.portraits.get(card.id);
  if (image) {
    const scale = Math.min(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    page.drawImage(image, {
      x: x + (width - imageWidth) / 2,
      y: y + (height - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    });
    page.drawRectangle({ x: x + 2, y: y + 2, width: width - 4, height: height - 4, borderColor: rgb(1, 1, 1), borderWidth: .55, borderOpacity: .65 });
    return;
  }
  const mark = initials(card.personName);
  const fontSize = 22;
  const textWidth = assets.bold.widthOfTextAtSize(mark, fontSize);
  page.drawText(mark, { x: x + width / 2 - textWidth / 2, y: y + height / 2 - 8, size: fontSize, font: assets.bold, color: theme.primaryRgb });
}

function drawThemeBackdrop(page: PDFPage, theme: PdfTheme, x: number, y: number, side: IdentityCardArtworkSide) {
  const base = side === "front" ? theme.frontBackgroundRgb : theme.backBackgroundRgb;
  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: base });

  if (theme.layout === "heritage") {
    page.drawRectangle({ x, y, width: 15, height: CARD_HEIGHT, color: theme.primaryRgb });
    page.drawRectangle({ x: x + 15, y, width: 3.2, height: CARD_HEIGHT, color: theme.highlightRgb });
    for (let i = 0; i < 7; i += 1) {
      page.drawCircle({ x: x + CARD_WIDTH - 22, y: y + 78, size: 18 + i * 5, borderColor: i % 2 ? theme.primaryRgb : theme.highlightRgb, borderWidth: .45, borderOpacity: .065 });
    }
  } else if (theme.layout === "dark") {
    page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: theme.frontBackgroundRgb });
    page.drawRectangle({ x, y: y + CARD_HEIGHT - 4, width: CARD_WIDTH, height: 4, color: theme.accentRgb });
    for (let i = 0; i < 9; i += 1) {
      page.drawLine({ start: { x: x + 55 + i * 24, y }, end: { x: x + 10 + i * 24, y: y + CARD_HEIGHT }, thickness: .7, color: i % 2 ? theme.accentRgb : theme.highlightRgb, opacity: .08 });
    }
    page.drawCircle({ x: x + CARD_WIDTH - 22, y: y + 27, size: 46, color: theme.accentRgb, opacity: .07 });
  } else if (theme.layout === "crest") {
    page.drawCircle({ x: x + 5, y: y + CARD_HEIGHT - 5, size: 76, color: theme.primaryRgb });
    page.drawCircle({ x: x + 9, y: y + CARD_HEIGHT - 10, size: 54, borderColor: theme.highlightRgb, borderWidth: 2, borderOpacity: .6 });
    page.drawCircle({ x: x + CARD_WIDTH + 8, y: y + 18, size: 54, borderColor: theme.highlightRgb, borderWidth: 8, borderOpacity: .13 });
    page.drawRectangle({ x, y, width: CARD_WIDTH, height: 3, color: theme.accentRgb });
  } else if (theme.layout === "split") {
    page.drawRectangle({ x, y, width: 92, height: CARD_HEIGHT, color: theme.primaryRgb });
    page.drawRectangle({ x: x + 86, y, width: 8, height: CARD_HEIGHT, color: theme.highlightRgb });
    page.drawLine({ start: { x: x + 93, y }, end: { x: x + 126, y: y + CARD_HEIGHT }, thickness: 5, color: theme.accentRgb, opacity: .18 });
    page.drawRectangle({ x: x + 94, y: y + CARD_HEIGHT - 4, width: CARD_WIDTH - 94, height: 4, color: theme.highlightRgb });
  } else if (theme.layout === "wave") {
    page.drawCircle({ x: x + CARD_WIDTH - 10, y: y - 28, size: 112, color: theme.primaryRgb, opacity: .94 });
    page.drawCircle({ x: x + CARD_WIDTH - 25, y: y - 16, size: 92, color: theme.accentRgb, opacity: .55 });
    page.drawCircle({ x: x + CARD_WIDTH - 52, y: y + 5, size: 72, color: theme.highlightRgb, opacity: .22 });
    page.drawRectangle({ x, y: y + CARD_HEIGHT - 3, width: CARD_WIDTH, height: 3, color: theme.primaryRgb });
  } else {
    for (let gx = 0; gx <= CARD_WIDTH; gx += 17) page.drawLine({ start: { x: x + gx, y }, end: { x: x + gx, y: y + CARD_HEIGHT }, thickness: .3, color: theme.accentRgb, opacity: .06 });
    for (let gy = 0; gy <= CARD_HEIGHT; gy += 17) page.drawLine({ start: { x, y: y + gy }, end: { x: x + CARD_WIDTH, y: y + gy }, thickness: .3, color: theme.highlightRgb, opacity: .05 });
    page.drawLine({ start: { x, y: y + 55 }, end: { x: x + CARD_WIDTH, y: y + 55 }, thickness: 2.2, color: theme.accentRgb, opacity: .75 });
    page.drawLine({ start: { x: x + 55, y: y + 55 }, end: { x: x + 82, y: y + 68 }, thickness: 2.2, color: theme.highlightRgb, opacity: .7 });
    page.drawLine({ start: { x: x + 82, y: y + 68 }, end: { x: x + 110, y: y + 44 }, thickness: 2.2, color: theme.accentRgb, opacity: .7 });
    page.drawLine({ start: { x: x + 110, y: y + 44 }, end: { x: x + CARD_WIDTH, y: y + 55 }, thickness: 2.2, color: theme.highlightRgb, opacity: .5 });
  }
}

function geometry(theme: PdfTheme) {
  switch (theme.layout) {
    case "split": return { logoX: 16, logoY: 119, logoSize: 24, schoolX: 104, schoolY: 137, titleX: 104, titleY: 125, portraitX: 18, portraitY: 34, portraitW: 62, portraitH: 76, infoX: 104, infoY: 107, infoW: 126 };
    case "dark": return { logoX: 18, logoY: 118, logoSize: 25, schoolX: 52, schoolY: 137, titleX: 52, titleY: 125, portraitX: 19, portraitY: 33, portraitW: 66, portraitH: 76, infoX: 98, infoY: 106, infoW: 132 };
    case "tech": return { logoX: 18, logoY: 118, logoSize: 25, schoolX: 52, schoolY: 137, titleX: 52, titleY: 125, portraitX: 19, portraitY: 32, portraitW: 65, portraitH: 76, infoX: 98, infoY: 105, infoW: 132 };
    case "crest": return { logoX: 22, logoY: 119, logoSize: 24, schoolX: 55, schoolY: 137, titleX: 55, titleY: 125, portraitX: 27, portraitY: 31, portraitW: 62, portraitH: 78, infoX: 101, infoY: 106, infoW: 128 };
    case "wave": return { logoX: 20, logoY: 119, logoSize: 24, schoolX: 54, schoolY: 137, titleX: 54, titleY: 125, portraitX: 27, portraitY: 31, portraitW: 62, portraitH: 78, infoX: 101, infoY: 106, infoW: 128 };
    default: return { logoX: 26, logoY: 119, logoSize: 25, schoolX: 58, schoolY: 137, titleX: 58, titleY: 125, portraitX: 27, portraitY: 32, portraitW: 61, portraitH: 76, infoX: 100, infoY: 105, infoW: 129 };
  }
}

function drawFront(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, x: number, y: number) {
  const theme = pdfTheme(school.brandColors);
  const g = geometry(theme);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && !card.isExpired;
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";

  drawThemeBackdrop(page, theme, x, y, "front");
  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, borderColor: theme.lineRgb, borderWidth: .7, borderOpacity: .9 });

  drawLogo(page, assets, school, x + g.logoX, y + g.logoY, g.logoSize, theme, theme.layout === "dark" || theme.layout === "tech" || theme.layout === "split");
  const headerColor = theme.layout === "split" ? theme.primaryRgb : theme.inkRgb;
  fitText(page, assets.bold, school.name.toUpperCase(), x + g.schoolX, y + g.schoolY, CARD_WIDTH - g.schoolX - 14, 8.8, headerColor, 5.8);
  page.drawText(card.personType === "student" ? "STUDENT IDENTITY CARD" : "STAFF IDENTITY CARD", { x: x + g.titleX, y: y + g.titleY, size: 3.8, font: assets.bold, color: theme.accentRgb, maxWidth: CARD_WIDTH - g.titleX - 14 });

  drawPortrait(page, assets, card, x + g.portraitX, y + g.portraitY, g.portraitW, g.portraitH, theme);
  fitText(page, assets.bold, card.personName, x + g.infoX, y + g.infoY, g.infoW, 10.6, theme.inkRgb, 6.5);
  page.drawRectangle({ x: x + g.infoX, y: y + g.infoY - 7, width: 54, height: 1.4, color: theme.highlightRgb });
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: x + g.infoX, y: y + g.infoY - 18, size: 3.2, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.bold, schoolId, x + g.infoX, y + g.infoY - 29, g.infoW, 8.2, theme.primaryRgb, 5.3);
  page.drawText(card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION", { x: x + g.infoX, y: y + g.infoY - 42, size: 3.1, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.bold, roleLine, x + g.infoX, y + g.infoY - 52, g.infoW, 6.1, theme.inkRgb, 4.3);
  page.drawText("CREDENTIAL NO.", { x: x + g.infoX, y: y + g.infoY - 65, size: 3.05, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.regular, card.serial, x + g.infoX, y + g.infoY - 74, g.infoW, 4.45, theme.inkRgb, 3.2);

  if (theme.layout !== "split") {
    const label = card.personType === "student" ? "STUDENT" : "STAFF";
    page.drawRectangle({ x: x + CARD_WIDTH - 48, y: y + CARD_HEIGHT - 27, width: 36, height: 13, color: theme.surfaceRgb, opacity: .82, borderColor: theme.accentRgb, borderWidth: .45 });
    const w = assets.bold.widthOfTextAtSize(label, 4.5);
    page.drawText(label, { x: x + CARD_WIDTH - 30 - w / 2, y: y + CARD_HEIGHT - 22.3, size: 4.5, font: assets.bold, color: theme.primaryRgb });
  }

  page.drawRectangle({ x: x + (theme.layout === "heritage" ? 18.2 : 0), y, width: CARD_WIDTH - (theme.layout === "heritage" ? 18.2 : 0), height: 24, color: theme.footerRgb });
  page.drawText("ISSUED", { x: x + (theme.layout === "heritage" ? 28 : 12), y: y + 14.8, size: 2.8, font: assets.bold, color: theme.footerInkRgb, opacity: .68 });
  page.drawText(cardDate(card.issuedAt), { x: x + (theme.layout === "heritage" ? 28 : 12), y: y + 7.2, size: 4.7, font: assets.bold, color: theme.footerInkRgb });
  page.drawText("VALID UNTIL", { x: x + (theme.layout === "heritage" ? 81 : 65), y: y + 14.8, size: 2.8, font: assets.bold, color: theme.footerInkRgb, opacity: .68 });
  page.drawText(cardDate(card.expiresAt), { x: x + (theme.layout === "heritage" ? 81 : 65), y: y + 7.2, size: 4.7, font: assets.bold, color: theme.footerInkRgb });
  page.drawRectangle({ x: x + 139, y: y + 5, width: 42, height: 14, color: active ? theme.highlightRgb : rgb(.62, .15, .16) });
  const statusWidth = assets.bold.widthOfTextAtSize(status, 4.7);
  page.drawText(status, { x: x + 160 - statusWidth / 2, y: y + 9.8, size: 4.7, font: assets.bold, color: active ? theme.qrInkRgb : rgb(1, 1, 1) });
  page.drawText("SUKUUNOVA VERIFIED SCHOOL ID", { x: x + 187, y: y + 10, size: 2.5, font: assets.bold, color: theme.footerInkRgb, opacity: .82, maxWidth: 45 });
}

function drawBack(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, x: number, y: number) {
  const theme = pdfTheme(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const matrix = assets.qr.get(card.id) ?? [];

  drawThemeBackdrop(page, theme, x, y, "back");
  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, borderColor: theme.lineRgb, borderWidth: .7 });
  const darkHeader = theme.layout === "dark" || theme.layout === "tech" || theme.layout === "split";
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 29, width: CARD_WIDTH, height: 29, color: theme.primaryRgb, opacity: darkHeader ? .96 : .94 });
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 32, width: CARD_WIDTH, height: 3, color: theme.highlightRgb });
  drawLogo(page, assets, school, x + 10, y + CARD_HEIGHT - 25, 18, theme, true);
  fitText(page, assets.bold, school.name.toUpperCase(), x + 35, y + CARD_HEIGHT - 13.8, 128, 7.4, rgb(1, 1, 1), 5.4);
  page.drawText("LIVE CREDENTIAL VERIFICATION", { x: x + 35, y: y + CARD_HEIGHT - 22.8, size: 3.5, font: assets.bold, color: theme.highlightRgb, maxWidth: 128 });

  const leftX = x + 13;
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: leftX, y: y + 105, size: 3.1, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.bold, schoolId, leftX, y + 95.5, 126, 7.4, theme.primaryRgb, 5.1);
  page.drawText(card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION", { x: leftX, y: y + 82, size: 3.05, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.bold, roleLine, leftX, y + 72.5, 126, 5.9, theme.inkRgb, 4.1);
  page.drawText(card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT", { x: leftX, y: y + 59, size: 3.05, font: assets.bold, color: theme.mutedRgb });
  fitText(page, assets.bold, contact1, leftX, y + 49.8, 126, 5.5, theme.inkRgb, 3.8);
  fitText(page, assets.regular, contact2, leftX, y + 41.8, 126, 4.4, theme.mutedRgb, 3.2);

  const qrSize = 76;
  const qrX = x + CARD_WIDTH - qrSize - 11;
  const qrY = y + 38;
  drawQr(page, matrix, qrX, qrY + 3, qrSize, theme);
  page.drawText("SCAN · VERIFY LIVE", { x: qrX - 1, y: qrY - 3, size: 4, font: assets.bold, color: theme.primaryRgb, maxWidth: qrSize + 2 });
  page.drawText("Official holder + live status", { x: qrX - 1, y: qrY - 9.1, size: 2.85, font: assets.regular, color: theme.mutedRgb, maxWidth: qrSize + 2 });

  page.drawLine({ start: { x: leftX, y: y + 31.5 }, end: { x: leftX + 68, y: y + 31.5 }, thickness: .55, color: theme.lineRgb });
  page.drawText("AUTHORISED SIGNATURE", { x: leftX, y: y + 25, size: 2.8, font: assets.bold, color: theme.mutedRgb });
  page.drawText(`SCHOOL CODE · ${short(school.uniqueCode, 18)}`, { x: leftX + 80, y: y + 25.1, size: 3.2, font: assets.bold, color: theme.primaryRgb, maxWidth: 67 });
  fitText(page, assets.regular, card.serial, leftX, y + 17.7, 143, 3.05, theme.mutedRgb, 2.6);

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: 13, color: theme.footerRgb });
  fitText(page, assets.regular, `If found, return to ${school.name}. Scan the QR for the official live holder record.`, x + 11, y + 4.4, CARD_WIDTH - 22, 3, theme.footerInkRgb, 2.5);
}

async function prepareAssets(doc: PDFDocument, school: SchoolIdentityBrand, cards: IdentityCardView[], origin: string): Promise<PdfAssets> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedImage(doc, school.logoUrl);
  const portraits = new Map<string, PDFImage>();
  const qr = new Map<string, unknown[][]>();
  for (const card of cards) {
    const image = await embedImage(doc, card.photoUrl);
    if (image) portraits.set(card.id, image);
    qr.set(card.id, qrMatrix(identityCardCompactVerificationUrl(origin, school.uniqueCode, card)));
  }
  return { regular, bold, logo, portraits, qr };
}

function drawCropMarks(page: PDFPage, x: number, y: number) {
  const color = rgb(.43, .45, .47);
  const o = 3.2;
  const l = 6;
  const x2 = x + CARD_WIDTH;
  const y2 = y + CARD_HEIGHT;
  const line = (x1: number, y1: number, x3: number, y3: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x3, y: y3 }, thickness: .35, color, opacity: .65 });
  line(x - o - l, y, x - o, y); line(x, y - o - l, x, y - o);
  line(x2 + o, y, x2 + o + l, y); line(x2, y - o - l, x2, y - o);
  line(x - o - l, y2, x - o, y2); line(x, y2 + o, x, y2 + o + l);
  line(x2 + o, y2, x2 + o + l, y2); line(x2, y2 + o, x2, y2 + o + l);
}

function drawRegistration(page: PDFPage, y: number) {
  const x = A4_WIDTH / 2;
  const color = rgb(.43, .45, .47);
  page.drawLine({ start: { x: x - 5, y }, end: { x: x + 5, y }, thickness: .35, color, opacity: .62 });
  page.drawLine({ start: { x, y: y - 5 }, end: { x, y: y + 5 }, thickness: .35, color, opacity: .62 });
}

function sheetHeader(page: PDFPage, assets: PdfAssets, school: SchoolIdentityBrand, title: string, footer: string) {
  const theme = pdfTheme(school.brandColors);
  page.drawText(school.name, { x: 48, y: A4_HEIGHT - 22, size: 8, font: assets.bold, color: rgb(.06, .09, .13), maxWidth: A4_WIDTH - 96 });
  page.drawText(`${title} · ${theme.name}`, { x: 48, y: A4_HEIGHT - 34, size: 6, font: assets.bold, color: rgb(.35, .39, .44), maxWidth: A4_WIDTH - 96 });
  page.drawText(footer, { x: 48, y: 12, size: 5, font: assets.bold, color: rgb(.35, .39, .44), maxWidth: A4_WIDTH - 96 });
  drawRegistration(page, A4_HEIGHT - 43);
  drawRegistration(page, 43);
}

export async function buildIdentityCardSinglePdfV4(card: IdentityCardView, school: SchoolIdentityBrand, origin: string) {
  const doc = await PDFDocument.create();
  const assets = await prepareAssets(doc, school, [card], origin);
  const front = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawFront(front, assets, card, school, 0, 0);
  const back = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawBack(back, assets, card, school, 0, 0);
  const theme = identityCardTheme(school.brandColors);
  doc.setTitle(`${school.name} · ${card.personName} · ${theme.name} secure school ID`);
  doc.setSubject(`Two-sided CR80 school credential · ${theme.name} · live QR verification`);
  return Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
}

export async function buildIdentityCardBulkPdfV4(cards: IdentityCardView[], school: SchoolIdentityBrand, origin: string) {
  if (!cards.length) throw new AppError("No current identity cards matched this selection.", 404, "NO_CARDS");
  if (cards.length > ID_CARD_PACK_LIMIT) throw new AppError(`A print file can contain at most ${ID_CARD_PACK_LIMIT} cards. The ID-card workspace automatically divides larger jobs into safe packs.`, 413, "PRINT_PACK_TOO_LARGE");
  const doc = await PDFDocument.create();
  const assets = await prepareAssets(doc, school, cards, origin);
  const gridWidth = 2 * CARD_WIDTH + GAP_X;
  const marginX = (A4_WIDTH - gridWidth) / 2;
  const topY = A4_HEIGHT - 49 - CARD_HEIGHT;

  for (let offset = 0; offset < cards.length; offset += 8) {
    const batch = cards.slice(offset, offset + 8);
    const sheetNo = Math.floor(offset / 8) + 1;
    const front = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    sheetHeader(front, assets, school, `FRONTS · SHEET ${sheetNo}`, "CR80 85.60 × 53.98 mm · Print 100% / Actual Size · Duplex long-edge · Do not Fit to Page");
    for (let index = 0; index < batch.length; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const px = marginX + column * (CARD_WIDTH + GAP_X);
      const py = topY - row * (CARD_HEIGHT + GAP_Y);
      drawFront(front, assets, batch[index], school, px, py);
      drawCropMarks(front, px, py);
    }

    const back = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    sheetHeader(back, assets, school, `BACKS · SHEET ${sheetNo}`, "Back positions are mirrored for duplex alignment · Print 100% / Actual Size · Flip on long edge");
    for (let index = 0; index < batch.length; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const mirrored = 1 - column;
      const px = marginX + mirrored * (CARD_WIDTH + GAP_X);
      const py = topY - row * (CARD_HEIGHT + GAP_Y);
      drawBack(back, assets, batch[index], school, px, py);
      drawCropMarks(back, px, py);
    }
  }

  const theme = identityCardTheme(school.brandColors);
  doc.setTitle(`${school.name} · ${theme.name} duplex school ID print pack`);
  doc.setSubject("Cut-ready A4 duplex sheets containing themed CR80 student and staff identity cards");
  return Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
}

function xml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function safeSvgImage(value: string | null | undefined) {
  if (!value) return null;
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s+/g, "");
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

function svgImageOrInitials(value: string | null | undefined, label: string, x: number, y: number, width: number, height: number, primary: string, clipId: string, fit: "slice" | "meet") {
  const image = safeSvgImage(value);
  if (image) return `<image href="${xml(image)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${fit}" clip-path="url(#${clipId})"/>`;
  return `<text x="${x + width / 2}" y="${y + height / 2 + 18}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" fill="${primary}">${xml(initials(label))}</text>`;
}

function svgQr(value: string, x: number, y: number, size: number, ink: string) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  if (!count) return "";
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  let blocks = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        blocks += `<rect x="${(x + (column + quiet) * unit).toFixed(2)}" y="${(y + (row + quiet) * unit).toFixed(2)}" width="${(unit + .08).toFixed(2)}" height="${(unit + .08).toFixed(2)}" fill="${ink}"/>`;
      }
    }
  }
  return `<rect x="${x - 8}" y="${y - 8}" width="${size + 16}" height="${size + 16}" rx="8" fill="#fff"/>${blocks}`;
}

function svgBackdrop(theme: IdentityCardTheme, side: IdentityCardArtworkSide) {
  const base = side === "front" ? theme.frontBackground : theme.backBackground;
  if (theme.layout === "heritage") return `<rect width="856" height="539.8" rx="26" fill="${base}"/><rect width="54" height="539.8" fill="${theme.primary}"/><rect x="54" width="11" height="539.8" fill="${theme.highlight}"/><circle cx="820" cy="300" r="150" fill="none" stroke="${theme.highlight}" stroke-width="18" opacity=".08"/><circle cx="820" cy="300" r="105" fill="none" stroke="${theme.primary}" stroke-width="8" opacity=".06"/>`;
  if (theme.layout === "dark") return `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.frontBackground}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient></defs><rect width="856" height="539.8" rx="26" fill="url(#bg)"/><path d="M180 0 L0 410 M350 0 L120 540 M540 0 L330 540 M760 0 L570 540" stroke="${theme.accent}" stroke-width="5" opacity=".08"/><circle cx="790" cy="470" r="170" fill="${theme.accent}" opacity=".07"/>`;
  if (theme.layout === "crest") return `<rect width="856" height="539.8" rx="26" fill="${base}"/><circle cx="10" cy="15" r="250" fill="${theme.primary}"/><circle cx="20" cy="15" r="175" fill="none" stroke="${theme.highlight}" stroke-width="12" opacity=".55"/><circle cx="870" cy="495" r="165" fill="none" stroke="${theme.highlight}" stroke-width="30" opacity=".12"/>`;
  if (theme.layout === "split") return `<rect width="856" height="539.8" rx="26" fill="${base}"/><path d="M0 0 H340 L280 540 H0 Z" fill="${theme.primary}"/><path d="M330 0 H360 L300 540 H270 Z" fill="${theme.highlight}"/><path d="M370 0 H390 L330 540 H310 Z" fill="${theme.accent}" opacity=".2"/>`;
  if (theme.layout === "wave") return `<defs><linearGradient id="wave" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.frontBackground}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="856" height="539.8" rx="26" fill="url(#wave)"/><circle cx="830" cy="620" r="360" fill="${theme.primary}"/><circle cx="760" cy="585" r="300" fill="${theme.accent}" opacity=".7"/><circle cx="680" cy="550" r="230" fill="${theme.highlight}" opacity=".23"/>`;
  return `<rect width="856" height="539.8" rx="26" fill="${base}"/><pattern id="grid" width="55" height="55" patternUnits="userSpaceOnUse"><path d="M55 0H0V55" fill="none" stroke="${theme.accent}" stroke-width="2" opacity=".07"/></pattern><rect width="856" height="539.8" fill="url(#grid)"/><path d="M0 340 H160 L210 300 L270 365 L330 330 H856" fill="none" stroke="${theme.accent}" stroke-width="7" opacity=".65"/><path d="M0 350 H210 L270 385 L345 320 L420 350 H856" fill="none" stroke="${theme.highlight}" stroke-width="4" opacity=".4"/>`;
}

function svgShell(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="85.6mm" height="53.98mm" viewBox="0 0 856 539.8" role="img">${content}</svg>`;
}

export function buildIdentityCardSvgV4(card: IdentityCardView, school: SchoolIdentityBrand, origin: string, side: IdentityCardArtworkSide) {
  const theme = identityCardTheme(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && !card.isExpired;
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  const dark = theme.layout === "dark" || theme.layout === "tech";
  const logoX = theme.layout === "split" ? 48 : 88;
  const logoY = 32;
  const logo = svgImageOrInitials(school.logoUrl, school.name, logoX, logoY, 82, 82, theme.primary, "logoClip", "meet");

  if (side === "front") {
    const portraitX = theme.layout === "split" ? 54 : 92;
    const portrait = svgImageOrInitials(card.photoUrl, card.personName, portraitX, 171, 218, 250, theme.primary, "portraitClip", "slice");
    const infoX = theme.layout === "split" ? 365 : 350;
    const headerX = theme.layout === "split" ? 365 : 200;
    const headerColor = dark ? theme.ink : theme.primary;
    return svgShell(`<defs><clipPath id="logoClip"><rect x="${logoX}" y="${logoY}" width="82" height="82" rx="10"/></clipPath><clipPath id="portraitClip"><rect x="${portraitX}" y="171" width="218" height="250" rx="10"/></clipPath></defs>${svgBackdrop(theme,"front")}<rect x="${logoX}" y="${logoY}" width="82" height="82" rx="10" fill="#fff" stroke="${theme.highlight}" stroke-width="4"/>${logo}<text x="${headerX}" y="70" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="900" fill="${headerColor}">${xml(short(school.name.toUpperCase(),31))}</text><text x="${headerX}" y="101" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="${theme.accent}">${card.personType === "student" ? "STUDENT IDENTITY CARD" : "STAFF IDENTITY CARD"}</text><rect x="${portraitX - 8}" y="163" width="234" height="266" rx="12" fill="${theme.portraitBorder}"/>${portrait}<text x="${infoX}" y="205" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="900" fill="${theme.ink}">${xml(short(card.personName,27))}</text><rect x="${infoX}" y="221" width="180" height="6" rx="3" fill="${theme.highlight}"/><text x="${infoX}" y="261" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="${theme.muted}">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="${infoX}" y="302" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="900" fill="${theme.primary}">${xml(short(schoolId,28))}</text><text x="${infoX}" y="346" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="${theme.muted}">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</text><text x="${infoX}" y="380" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="800" fill="${theme.ink}">${xml(short(roleLine,32))}</text><text x="${infoX}" y="418" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${theme.muted}">CREDENTIAL NO.</text><text x="${infoX}" y="444" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${theme.ink}">${xml(short(card.serial,38))}</text><rect x="0" y="458" width="856" height="81.8" fill="${theme.footer}"/><text x="39" y="487" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" fill="${theme.footerInk}" opacity=".7">ISSUED</text><text x="39" y="516" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="${theme.footerInk}">${xml(cardDate(card.issuedAt))}</text><text x="223" y="487" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" fill="${theme.footerInk}" opacity=".7">VALID UNTIL</text><text x="223" y="516" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="${theme.footerInk}">${xml(cardDate(card.expiresAt))}</text><rect x="492" y="480" width="142" height="42" rx="5" fill="${active ? theme.highlight : "#9D2934"}"/><text x="563" y="507" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="900" fill="${active ? theme.qrInk : "#fff"}">${status}</text><text x="655" y="503" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" fill="${theme.footerInk}" opacity=".85">SUKUUNOVA VERIFIED SCHOOL ID</text><rect x="2" y="2" width="852" height="535.8" rx="25" fill="none" stroke="${theme.line}" stroke-width="3"/>`);
  }

  const contactLabel = card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT";
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const qrUrl = identityCardCompactVerificationUrl(origin, school.uniqueCode, card);
  const qr = svgQr(qrUrl, 565, 166, 250, theme.qrInk);
  return svgShell(`<defs><clipPath id="logoClip"><rect x="38" y="28" width="70" height="70" rx="9"/></clipPath></defs>${svgBackdrop(theme,"back")}<rect width="856" height="112" rx="26" fill="${theme.primary}"/><rect y="102" width="856" height="11" fill="${theme.highlight}"/><rect x="38" y="28" width="70" height="70" rx="9" fill="#fff" stroke="${theme.highlight}" stroke-width="3"/>${svgImageOrInitials(school.logoUrl, school.name, 38, 28, 70, 70, theme.primary, "logoClip", "meet")}<text x="133" y="61" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="900" fill="#fff">${xml(short(school.name.toUpperCase(),30))}</text><text x="134" y="91" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="${theme.highlight}">LIVE CREDENTIAL VERIFICATION</text><text x="46" y="165" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${theme.muted}">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="46" y="202" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="900" fill="${theme.primary}">${xml(short(schoolId,28))}</text><text x="46" y="247" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${theme.muted}">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</text><text x="46" y="280" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="900" fill="${theme.ink}">${xml(short(roleLine,32))}</text><text x="46" y="326" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${theme.muted}">${contactLabel}</text><text x="46" y="359" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="${theme.ink}">${xml(short(contact1,30))}</text><text x="46" y="386" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="${theme.muted}">${xml(short(contact2,36))}</text><line x1="46" y1="431" x2="280" y2="431" stroke="${theme.line}" stroke-width="2"/><text x="46" y="453" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" letter-spacing="1.4" fill="${theme.muted}">AUTHORISED SIGNATURE</text><text x="313" y="451" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900" fill="${theme.primary}">SCHOOL CODE · ${xml(short(school.uniqueCode,18))}</text>${qr}<text x="690" y="438" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="900" fill="${theme.primary}">SCAN · VERIFY LIVE</text><text x="690" y="460" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="${theme.muted}">Official holder + live status</text><rect x="0" y="490" width="856" height="49.8" fill="${theme.footer}"/><text x="428" y="520" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="${theme.footerInk}">If found, return to ${xml(short(school.name,38))}. Scan the QR for the official live holder record.</text><rect x="2" y="2" width="852" height="535.8" rx="25" fill="none" stroke="${theme.line}" stroke-width="3"/>`);
}
