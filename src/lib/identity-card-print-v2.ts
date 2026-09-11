import encodeQR from "qr";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import type { IdentityCardView } from "./identity-card-service";
import { identityCardSignature, identityCardVerificationPath } from "./identity-card-service";
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

type Palette = {
  primary: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  primaryHex: string;
  accentHex: string;
};

type PdfAssets = {
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  portraits: Map<string, PDFImage>;
  qr: Map<string, unknown[][]>;
};

function hex(value: unknown, fallback: string) {
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)) return value.startsWith("#") ? value : `#${value}`;
  return fallback;
}

function palette(value: unknown): Palette {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const primaryHex = hex(row.primary ?? row.primaryColor, "#08263D");
  const accentHex = hex(row.accent ?? row.secondary, "#13B8A6");
  const toRgb = (v: string) => rgb(parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255);
  return { primary: toRgb(primaryHex), accent: toRgb(accentHex), primaryHex, accentHex };
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

function verifyUrl(origin: string, school: SchoolIdentityBrand, card: IdentityCardView) {
  const root = origin.replace(/\/+$/g, "");
  return `${root}${identityCardVerificationPath(school.uniqueCode, card.serial)}?sig=${identityCardSignature(card)}`;
}

function qrMatrix(value: string) {
  const raw = encodeQR(value, "raw", { ecc: "high" }) as unknown;
  return Array.isArray(raw)
    ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>))
    : [];
}

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, minimum = 4) {
  const value = String(text || "-");
  let actual = size;
  while (actual > minimum && font.widthOfTextAtSize(value, actual) > width) actual -= .25;
  page.drawText(value, { x, y, size: actual, font, color, maxWidth: width });
}

function drawMicroSecurity(page: PDFPage, primary: ReturnType<typeof rgb>, accent: ReturnType<typeof rgb>) {
  for (let index = 0; index < 10; index += 1) {
    const x = 128 + index * 13;
    page.drawCircle({ x, y: 77, size: 23 + index * 3.8, borderColor: index % 2 ? primary : accent, borderWidth: .45, borderOpacity: .055 });
  }
  for (let index = 0; index < 14; index += 1) {
    const offset = index * 19 - 40;
    page.drawLine({ start: { x: offset, y: 0 }, end: { x: offset + 83, y: CARD_HEIGHT }, thickness: .35, color: index % 2 ? primary : accent, opacity: .045 });
  }
}

function drawQr(page: PDFPage, matrix: unknown[][], x: number, y: number, size: number, dark: ReturnType<typeof rgb>) {
  const count = matrix.length;
  if (!count) return;
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: rgb(.83, .87, .9), borderWidth: .55 });
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        page.drawRectangle({ x: x + (column + quiet) * unit, y: y + (count - row - 1 + quiet) * unit, width: unit + .06, height: unit + .06, color: dark });
      }
    }
  }
}

function drawLogo(page: PDFPage, assets: PdfAssets, school: SchoolIdentityBrand, x: number, y: number, size: number, p: Palette) {
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: p.accent, borderWidth: .8 });
  if (assets.logo) {
    const scale = Math.min((size - 4) / assets.logo.width, (size - 4) / assets.logo.height);
    const width = assets.logo.width * scale;
    const height = assets.logo.height * scale;
    page.drawImage(assets.logo, { x: x + (size - width) / 2, y: y + (size - height) / 2, width, height });
    return;
  }
  const mark = initials(school.name);
  const w = assets.bold.widthOfTextAtSize(mark, size * .28);
  page.drawText(mark, { x: x + size / 2 - w / 2, y: y + size * .39, size: size * .28, font: assets.bold, color: p.primary });
}

function drawPortrait(page: PDFPage, assets: PdfAssets, card: IdentityCardView, x: number, y: number, width: number, height: number, p: Palette) {
  page.drawRectangle({ x, y, width, height, color: rgb(.955, .97, .98), borderColor: p.accent, borderWidth: 1.15 });
  const image = assets.portraits.get(card.id);
  if (image) {
    const scale = Math.max(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    const clipPad = 1.5;
    page.drawImage(image, {
      x: x + (width - imageWidth) / 2,
      y: y + (height - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
      opacity: 1,
    });
    page.drawRectangle({ x: x + clipPad, y: y + clipPad, width: width - clipPad * 2, height: height - clipPad * 2, borderColor: rgb(1, 1, 1), borderWidth: 1.1, borderOpacity: .7 });
    return;
  }
  const mark = initials(card.personName);
  const w = assets.bold.widthOfTextAtSize(mark, 21);
  page.drawText(mark, { x: x + width / 2 - w / 2, y: y + height / 2 - 7, size: 21, font: assets.bold, color: p.primary });
}

function drawFront(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, x: number, y: number) {
  const p = palette(school.brandColors);
  const dark = rgb(.035, .075, .115);
  const muted = rgb(.38, .43, .49);
  const line = rgb(.82, .86, .89);
  const soft = rgb(.955, .972, .98);
  const active = card.status === "active" && !card.isExpired;
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const descriptor = card.personType === "student" ? (card.className || "Class not assigned") : (card.roleName || "Staff member");

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: rgb(1, 1, 1), borderColor: p.primary, borderWidth: .8 });
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 31, width: CARD_WIDTH, height: 31, color: p.primary });
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 35, width: CARD_WIDTH, height: 4, color: p.accent });
  drawMicroSecurityTranslated(page, x, y, p.primary, p.accent);
  drawLogo(page, assets, school, x + 8, y + CARD_HEIGHT - 27, 20, p);
  fitText(page, assets.bold, school.name.toUpperCase(), x + 34, y + CARD_HEIGHT - 14.5, 150, 8.2, rgb(1, 1, 1), 6);
  page.drawText("OFFICIAL SCHOOL CREDENTIAL", { x: x + 34, y: y + CARD_HEIGHT - 24, size: 3.8, font: assets.bold, color: p.accent, maxWidth: 128 });
  page.drawRectangle({ x: x + CARD_WIDTH - 54, y: y + CARD_HEIGHT - 23.5, width: 43, height: 11, color: rgb(1, 1, 1), opacity: .12 });
  const typeLabel = card.personType === "student" ? "STUDENT" : "STAFF";
  const typeW = assets.bold.widthOfTextAtSize(typeLabel, 5.6);
  page.drawText(typeLabel, { x: x + CARD_WIDTH - 32.5 - typeW / 2, y: y + CARD_HEIGHT - 19.5, size: 5.6, font: assets.bold, color: rgb(1, 1, 1) });

  drawPortrait(page, assets, card, x + 9, y + 35, 62, 72, p);
  const infoX = x + 81;
  fitText(page, assets.bold, card.personName, infoX, y + 93, 147, 11.2, dark, 6.8);
  page.drawRectangle({ x: infoX, y: y + 87.3, width: 76, height: 1.4, color: p.accent });
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: infoX, y: y + 77.3, size: 3.5, font: assets.bold, color: muted });
  fitText(page, assets.bold, schoolId, infoX, y + 68.5, 142, 7.6, p.primary, 5.2);
  page.drawText(card.personType === "student" ? "CLASS" : "ROLE / POSITION", { x: infoX, y: y + 57.5, size: 3.5, font: assets.bold, color: muted });
  fitText(page, assets.regular, descriptor, infoX, y + 49.5, 142, 6.4, dark, 4.4);
  page.drawText("CREDENTIAL NO.", { x: infoX, y: y + 39, size: 3.5, font: assets.bold, color: muted });
  fitText(page, assets.regular, card.serial, infoX, y + 31.6, 142, 5.1, dark, 3.8);

  if (assets.portraits.has(card.id)) {
    const ghost = assets.portraits.get(card.id)!;
    const ghostSize = 48;
    const scale = Math.min(ghostSize / ghost.width, ghostSize / ghost.height);
    page.drawImage(ghost, { x: x + CARD_WIDTH - 58, y: y + 33, width: ghost.width * scale, height: ghost.height * scale, opacity: .055 });
  }

  page.drawRectangle({ x: x + 9, y: y + 8, width: CARD_WIDTH - 18, height: 18, color: soft, borderColor: line, borderWidth: .45 });
  page.drawText("ISSUED", { x: x + 14, y: y + 19, size: 3.1, font: assets.bold, color: muted });
  page.drawText(cardDate(card.issuedAt), { x: x + 14, y: y + 11.8, size: 5.2, font: assets.bold, color: p.primary });
  page.drawText("VALID UNTIL", { x: x + 69, y: y + 19, size: 3.1, font: assets.bold, color: muted });
  page.drawText(cardDate(card.expiresAt), { x: x + 69, y: y + 11.8, size: 5.2, font: assets.bold, color: p.primary });
  page.drawRectangle({ x: x + 132, y: y + 10.4, width: 45, height: 13, color: active ? rgb(.9, .965, .93) : rgb(.985, .92, .92), borderColor: active ? rgb(.45, .72, .54) : rgb(.8, .45, .45), borderWidth: .5 });
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  const statusW = assets.bold.widthOfTextAtSize(status, 4.8);
  page.drawText(status, { x: x + 154.5 - statusW / 2, y: y + 14.7, size: 4.8, font: assets.bold, color: active ? rgb(.08, .42, .21) : rgb(.66, .12, .12) });
  page.drawText("SUKUUNOVA · VERIFIED SCHOOL ID", { x: x + 183, y: y + 16.9, size: 2.8, font: assets.bold, color: muted, maxWidth: 50 });
  page.drawText("FRONT", { x: x + 183, y: y + 11.1, size: 4.6, font: assets.bold, color: p.primary, maxWidth: 50 });
}

function drawMicroSecurityTranslated(page: PDFPage, x: number, y: number, primary: ReturnType<typeof rgb>, accent: ReturnType<typeof rgb>) {
  for (let index = 0; index < 10; index += 1) {
    page.drawCircle({ x: x + 183, y: y + 73, size: 18 + index * 3.5, borderColor: index % 2 ? primary : accent, borderWidth: .4, borderOpacity: .05 });
  }
  for (let index = 0; index < 12; index += 1) {
    const offset = index * 20 - 45;
    page.drawLine({ start: { x: x + offset, y }, end: { x: x + offset + 82, y: y + CARD_HEIGHT }, thickness: .32, color: index % 2 ? primary : accent, opacity: .04 });
  }
}

function drawBack(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, origin: string, x: number, y: number) {
  const p = palette(school.brandColors);
  const dark = rgb(.035, .075, .115);
  const muted = rgb(.38, .43, .49);
  const line = rgb(.82, .86, .89);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const matrix = assets.qr.get(card.id) ?? [];

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: rgb(1, 1, 1), borderColor: p.primary, borderWidth: .8 });
  drawMicroSecurityTranslated(page, x, y, p.primary, p.accent);
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 30, width: CARD_WIDTH, height: 30, color: p.primary });
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 34, width: CARD_WIDTH, height: 4, color: p.accent });
  drawLogo(page, assets, school, x + 9, y + CARD_HEIGHT - 26, 19, p);
  fitText(page, assets.bold, school.name.toUpperCase(), x + 34, y + CARD_HEIGHT - 14, 144, 7.7, rgb(1, 1, 1), 5.8);
  page.drawText("VERIFY · STATUS · AUTHENTICITY", { x: x + 34, y: y + CARD_HEIGHT - 23, size: 3.7, font: assets.bold, color: p.accent, maxWidth: 144 });

  const leftX = x + 11;
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: leftX, y: y + 101, size: 3.6, font: assets.bold, color: muted });
  fitText(page, assets.bold, schoolId, leftX, y + 91.5, 140, 7.5, p.primary, 5.2);
  page.drawText(card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION", { x: leftX, y: y + 79.5, size: 3.6, font: assets.bold, color: muted });
  fitText(page, assets.regular, roleLine, leftX, y + 71, 140, 6.2, dark, 4.3);
  page.drawText(card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT", { x: leftX, y: y + 58.5, size: 3.6, font: assets.bold, color: muted });
  fitText(page, assets.bold, contact1, leftX, y + 50.5, 140, 5.8, dark, 4);
  fitText(page, assets.regular, contact2, leftX, y + 42.3, 140, 5.1, muted, 3.7);

  const qrSize = 61;
  drawQr(page, matrix, x + CARD_WIDTH - qrSize - 11, y + 38, qrSize, p.primary);
  page.drawText("SCAN TO VERIFY", { x: x + CARD_WIDTH - qrSize - 11, y: y + 31, size: 4.2, font: assets.bold, color: p.primary, maxWidth: qrSize });
  page.drawText("Signed live credential", { x: x + CARD_WIDTH - qrSize - 11, y: y + 25, size: 3.2, font: assets.regular, color: muted, maxWidth: qrSize });

  page.drawLine({ start: { x: leftX, y: y + 29 }, end: { x: leftX + 75, y: y + 29 }, thickness: .55, color: line });
  page.drawText("AUTHORISED SIGNATURE", { x: leftX, y: y + 22, size: 3, font: assets.bold, color: muted });
  page.drawText(`School code: ${school.uniqueCode}`, { x: leftX + 88, y: y + 22, size: 3.7, font: assets.bold, color: p.primary, maxWidth: 72 });
  page.drawRectangle({ x: x + 8, y: y + 5, width: CARD_WIDTH - 16, height: 10, color: p.primary });
  fitText(page, assets.regular, `If found, return to ${school.name}. This is a school credential, not a national identity document.`, x + 12, y + 8.1, CARD_WIDTH - 24, 3.2, rgb(1, 1, 1), 2.7);
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
    qr.set(card.id, qrMatrix(verifyUrl(origin, school, card)));
  }
  return { regular, bold, logo, portraits, qr };
}

function drawCropMarks(page: PDFPage, x: number, y: number) {
  const color = rgb(.45, .48, .52);
  const o = 3.2;
  const l = 6;
  const x2 = x + CARD_WIDTH;
  const y2 = y + CARD_HEIGHT;
  const line = (x1: number, y1: number, x3: number, y3: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x3, y: y3 }, thickness: .35, color, opacity: .7 });
  line(x - o - l, y, x - o, y); line(x, y - o - l, x, y - o);
  line(x2 + o, y, x2 + o + l, y); line(x2, y - o - l, x2, y - o);
  line(x - o - l, y2, x - o, y2); line(x, y2 + o, x, y2 + o + l);
  line(x2 + o, y2, x2 + o + l, y2); line(x2, y2 + o, x2, y2 + o + l);
}

function drawRegistration(page: PDFPage, y: number) {
  const x = A4_WIDTH / 2;
  const color = rgb(.45, .48, .52);
  page.drawLine({ start: { x: x - 5, y }, end: { x: x + 5, y }, thickness: .35, color, opacity: .65 });
  page.drawLine({ start: { x, y: y - 5 }, end: { x, y: y + 5 }, thickness: .35, color, opacity: .65 });
}

function sheetHeader(page: PDFPage, assets: PdfAssets, school: SchoolIdentityBrand, title: string, footer: string) {
  page.drawText(school.name, { x: 48, y: A4_HEIGHT - 22, size: 8, font: assets.bold, color: rgb(.12, .16, .22), maxWidth: A4_WIDTH - 96 });
  page.drawText(title, { x: 48, y: A4_HEIGHT - 34, size: 6, font: assets.bold, color: rgb(.38, .43, .5), maxWidth: A4_WIDTH - 96 });
  page.drawText(footer, { x: 48, y: 12, size: 5, font: assets.bold, color: rgb(.42, .46, .5), maxWidth: A4_WIDTH - 96 });
  drawRegistration(page, A4_HEIGHT - 43);
  drawRegistration(page, 43);
}

export async function buildIdentityCardSinglePdfV2(card: IdentityCardView, school: SchoolIdentityBrand, origin: string) {
  const doc = await PDFDocument.create();
  const assets = await prepareAssets(doc, school, [card], origin);
  const front = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawFront(front, assets, card, school, 0, 0);
  const back = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawBack(back, assets, card, school, origin, 0, 0);
  doc.setTitle(`${school.name} · ${card.personName} · ID card`);
  doc.setSubject("Two-sided CR80 school identity credential");
  return Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
}

export async function buildIdentityCardBulkPdfV2(cards: IdentityCardView[], school: SchoolIdentityBrand, origin: string) {
  if (!cards.length) throw new AppError("No current identity cards matched this selection.", 404, "NO_CARDS");
  if (cards.length > ID_CARD_PACK_LIMIT) throw new AppError(`A print file can contain at most ${ID_CARD_PACK_LIMIT} cards. The ID-card workspace automatically divides larger jobs into multiple files.`, 413, "PRINT_PACK_TOO_LARGE");
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
      drawBack(back, assets, batch[index], school, origin, px, py);
      drawCropMarks(back, px, py);
    }
  }

  doc.setTitle(`${school.name} · duplex school ID print pack`);
  doc.setSubject("Cut-ready A4 duplex sheets containing CR80 student and staff identity cards");
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

function svgQr(value: string, x: number, y: number, size: number, color: string) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  if (!count) return "";
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  let blocks = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        blocks += `<rect x="${(x + (column + quiet) * unit).toFixed(2)}" y="${(y + (row + quiet) * unit).toFixed(2)}" width="${(unit + .08).toFixed(2)}" height="${(unit + .08).toFixed(2)}" fill="${color}"/>`;
      }
    }
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="#fff" stroke="#d6dee5" stroke-width="2"/>${blocks}`;
}

function svgShell(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="85.6mm" height="53.98mm" viewBox="0 0 856 539.8" role="img">${content}</svg>`;
}

function svgPattern(primary: string, accent: string) {
  const rings = Array.from({ length: 9 }, (_, i) => `<circle cx="660" cy="300" r="${90 + i * 22}" fill="none" stroke="${i % 2 ? primary : accent}" stroke-width="2" opacity="0.045"/>`).join("");
  const lines = Array.from({ length: 16 }, (_, i) => `<path d="M${i * 70 - 250} 540 L${i * 70 + 20} 0" stroke="${i % 2 ? primary : accent}" stroke-width="2" opacity="0.035"/>`).join("");
  return `${rings}${lines}`;
}

function svgImageOrInitials(value: string | null | undefined, label: string, x: number, y: number, width: number, height: number, primary: string, clipId: string, fit: "slice" | "meet") {
  const image = safeSvgImage(value);
  if (image) return `<image href="${xml(image)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${fit}" clip-path="url(#${clipId})"/>`;
  return `<text x="${x + width / 2}" y="${y + height / 2 + 18}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" fill="${primary}">${xml(initials(label))}</text>`;
}

export function buildIdentityCardSvgV2(card: IdentityCardView, school: SchoolIdentityBrand, origin: string, side: IdentityCardArtworkSide) {
  const p = palette(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const descriptor = card.personType === "student" ? (card.className || "Class not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && !card.isExpired;
  const logo = svgImageOrInitials(school.logoUrl, school.name, 33, 28, 70, 70, p.primaryHex, "logoClip", "meet");
  if (side === "front") {
    const portrait = svgImageOrInitials(card.photoUrl, card.personName, 35, 171, 230, 250, p.primaryHex, "portraitClip", "slice");
    return svgShell(`<defs><clipPath id="logoClip"><rect x="33" y="28" width="70" height="70" rx="12"/></clipPath><clipPath id="portraitClip"><rect x="35" y="171" width="230" height="250" rx="18"/></clipPath></defs><rect width="856" height="539.8" rx="28" fill="#fff"/>${svgPattern(p.primaryHex, p.accentHex)}<rect width="856" height="126" rx="28" fill="${p.primaryHex}"/><rect y="115" width="856" height="13" fill="${p.accentHex}"/><rect x="33" y="28" width="70" height="70" rx="12" fill="#fff" stroke="${p.accentHex}" stroke-width="3"/>${logo}<text x="128" y="65" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800" fill="#fff">${xml(short(school.name.toUpperCase(), 30))}</text><text x="129" y="93" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" letter-spacing="2.2" fill="${p.accentHex}">OFFICIAL SCHOOL CREDENTIAL</text><rect x="697" y="43" width="120" height="38" rx="19" fill="#fff" opacity=".12"/><text x="757" y="68" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="900" fill="#fff">${card.personType === "student" ? "STUDENT" : "STAFF"}</text><rect x="35" y="171" width="230" height="250" rx="18" fill="#f3f7fa" stroke="${p.accentHex}" stroke-width="4"/>${portrait}<text x="300" y="209" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="800" fill="#0c1925">${xml(short(card.personName, 28))}</text><rect x="300" y="227" width="260" height="6" rx="3" fill="${p.accentHex}"/><text x="300" y="270" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#687483">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="300" y="307" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="800" fill="${p.primaryHex}">${xml(short(schoolId, 28))}</text><text x="300" y="347" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#687483">${card.personType === "student" ? "CLASS" : "ROLE / POSITION"}</text><text x="300" y="379" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="#263442">${xml(short(descriptor, 32))}</text><text x="300" y="412" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#687483">CREDENTIAL NO.</text><text x="300" y="436" font-family="Arial,Helvetica,sans-serif" font-size="15" fill="#263442">${xml(short(card.serial, 38))}</text><rect x="35" y="458" width="786" height="54" rx="12" fill="#f4f8fa" stroke="#d8e0e7" stroke-width="2"/><text x="56" y="480" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.5" fill="#687483">ISSUED</text><text x="56" y="504" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" fill="${p.primaryHex}">${xml(cardDate(card.issuedAt))}</text><text x="245" y="480" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.5" fill="#687483">VALID UNTIL</text><text x="245" y="504" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" fill="${p.primaryHex}">${xml(cardDate(card.expiresAt))}</text><rect x="462" y="469" width="140" height="34" rx="17" fill="${active ? "#eaf7ee" : "#fff0f0"}" stroke="${active ? "#4b9b67" : "#b34a4a"}" stroke-width="2"/><text x="532" y="492" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" fill="${active ? "#1b6f3c" : "#9e2f2f"}">${active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED"}</text><text x="638" y="483" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.2" fill="#687483">SUKUUNOVA</text><text x="638" y="503" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800" fill="${p.primaryHex}">VERIFIED SCHOOL ID</text><rect x="1.5" y="1.5" width="853" height="536.8" rx="26" fill="none" stroke="${p.primaryHex}" stroke-width="3"/>`);
  }

  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const contactLabel = card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT";
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const qr = svgQr(verifyUrl(origin, school, card), 616, 174, 188, p.primaryHex);
  return svgShell(`<defs><clipPath id="logoClip"><rect x="33" y="28" width="70" height="70" rx="12"/></clipPath></defs><rect width="856" height="539.8" rx="28" fill="#fff"/>${svgPattern(p.primaryHex, p.accentHex)}<rect width="856" height="126" rx="28" fill="${p.primaryHex}"/><rect y="115" width="856" height="13" fill="${p.accentHex}"/><rect x="33" y="28" width="70" height="70" rx="12" fill="#fff" stroke="${p.accentHex}" stroke-width="3"/>${logo}<text x="128" y="65" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800" fill="#fff">${xml(short(school.name.toUpperCase(), 30))}</text><text x="129" y="93" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" letter-spacing="2.2" fill="${p.accentHex}">VERIFY · STATUS · AUTHENTICITY</text><text x="44" y="174" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#687483">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="44" y="208" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="800" fill="${p.primaryHex}">${xml(short(schoolId, 28))}</text><text x="44" y="252" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#687483">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</text><text x="44" y="284" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="700" fill="#263442">${xml(short(roleLine, 33))}</text><text x="44" y="329" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#687483">${contactLabel}</text><text x="44" y="361" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="800" fill="#263442">${xml(short(contact1, 36))}</text><text x="44" y="389" font-family="Arial,Helvetica,sans-serif" font-size="15" fill="#687483">${xml(short(contact2, 45))}</text><line x1="44" y1="441" x2="270" y2="441" stroke="#bdc8d2" stroke-width="2"/><text x="44" y="462" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4" fill="#687483">AUTHORISED SIGNATURE</text><text x="326" y="452" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" fill="${p.primaryHex}">SCHOOL CODE · ${xml(short(school.uniqueCode, 18))}</text>${qr}<text x="710" y="383" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900" fill="${p.primaryHex}">SCAN TO VERIFY</text><text x="710" y="405" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#687483">Signed live credential</text><rect x="22" y="486" width="812" height="34" rx="8" fill="${p.primaryHex}"/><text x="428" y="508" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#fff">If found, return to ${xml(short(school.name, 42))}. School credential only — not a national identity document.</text><rect x="1.5" y="1.5" width="853" height="536.8" rx="26" fill="none" stroke="${p.primaryHex}" stroke-width="3"/>`);
}
