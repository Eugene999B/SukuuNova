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
const GOLD = rgb(.79, .61, .25);
const GOLD_HEX = "#C99B40";
const IVORY = rgb(.988, .982, .958);
const IVORY_HEX = "#FCFAF4";
const INK = rgb(.035, .065, .09);
const INK_HEX = "#091117";
const MUTED = rgb(.34, .39, .43);
const MUTED_HEX = "#58636D";
const LINE = rgb(.82, .81, .76);
const LINE_HEX = "#D1CEC2";

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

function safeHex(value: unknown, fallback: string) {
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)) return value.startsWith("#") ? value : `#${value}`;
  return fallback;
}

function palette(value: unknown): Palette {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const primaryHex = safeHex(row.primary ?? row.primaryColor, "#0B3246");
  const accentHex = safeHex(row.accent ?? row.secondary, "#14A99A");
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

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, minimum = 4) {
  const value = String(text || "-");
  let actual = size;
  while (actual > minimum && font.widthOfTextAtSize(value, actual) > width) actual -= .25;
  page.drawText(value, { x, y, size: actual, font, color, maxWidth: width });
}

function qrMatrix(value: string) {
  // Level M keeps the printed symbol materially less dense while retaining the
  // normal QR recovery level used for clean PVC/paper credentials.
  const raw = encodeQR(value, "raw", { ecc: "medium" }) as unknown;
  return Array.isArray(raw)
    ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>))
    : [];
}

function drawQr(page: PDFPage, matrix: unknown[][], x: number, y: number, size: number) {
  const count = matrix.length;
  if (!count) return;
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        page.drawRectangle({
          x: x + (column + quiet) * unit,
          y: y + (count - row - 1 + quiet) * unit,
          width: unit + .035,
          height: unit + .035,
          color: INK,
        });
      }
    }
  }
}

function drawSecurityMesh(page: PDFPage, x: number, y: number, p: Palette) {
  for (let index = 0; index < 9; index += 1) {
    page.drawCircle({
      x: x + 189,
      y: y + 78,
      size: 18 + index * 4.2,
      borderColor: index % 2 ? p.primary : GOLD,
      borderWidth: .35,
      borderOpacity: .065,
    });
  }
  for (let index = 0; index < 11; index += 1) {
    const offset = index * 24 - 58;
    page.drawLine({
      start: { x: x + offset, y },
      end: { x: x + offset + 95, y: y + CARD_HEIGHT },
      thickness: .28,
      color: index % 2 ? p.accent : GOLD,
      opacity: .045,
    });
  }
}

function drawLogo(page: PDFPage, assets: PdfAssets, school: SchoolIdentityBrand, x: number, y: number, size: number, p: Palette) {
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 1 });
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
  page.drawText(mark, { x: x + size / 2 - width / 2, y: y + size * .39, size: fontSize, font: assets.bold, color: p.primary });
}

function drawPortrait(page: PDFPage, assets: PdfAssets, card: IdentityCardView, x: number, y: number, width: number, height: number, p: Palette) {
  page.drawRectangle({ x: x - 2, y: y - 2, width: width + 4, height: height + 4, color: GOLD });
  page.drawRectangle({ x, y, width, height, color: rgb(.95, .95, .93) });
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
    return;
  }
  const mark = initials(card.personName);
  const fontSize = 22;
  const textWidth = assets.bold.widthOfTextAtSize(mark, fontSize);
  page.drawText(mark, { x: x + width / 2 - textWidth / 2, y: y + height / 2 - 8, size: fontSize, font: assets.bold, color: p.primary });
}

function drawFront(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, x: number, y: number) {
  const p = palette(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const descriptor = card.personType === "student" ? (card.className || "Class not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && !card.isExpired;
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: IVORY, borderColor: p.primary, borderWidth: .75 });
  drawSecurityMesh(page, x, y, p);
  page.drawRectangle({ x, y, width: 15, height: CARD_HEIGHT, color: p.primary });
  page.drawRectangle({ x: x + 15, y, width: 3.2, height: CARD_HEIGHT, color: GOLD });
  page.drawRectangle({ x: x + 18.2, y: y + CARD_HEIGHT - 2, width: CARD_WIDTH - 18.2, height: 2, color: p.accent });

  drawLogo(page, assets, school, x + 25, y + CARD_HEIGHT - 33, 25, p);
  fitText(page, assets.bold, school.name.toUpperCase(), x + 57, y + CARD_HEIGHT - 16, 132, 8.7, p.primary, 6);
  page.drawText(card.personType === "student" ? "STUDENT IDENTITY CARD" : "STAFF IDENTITY CARD", {
    x: x + 57,
    y: y + CARD_HEIGHT - 27,
    size: 4.2,
    font: assets.bold,
    color: MUTED,
    maxWidth: 130,
  });
  page.drawRectangle({ x: x + CARD_WIDTH - 47, y: y + CARD_HEIGHT - 25.5, width: 35, height: 13, color: p.primary, opacity: .09, borderColor: p.primary, borderWidth: .35, borderOpacity: .25 });
  const type = card.personType === "student" ? "STUDENT" : "STAFF";
  const typeWidth = assets.bold.widthOfTextAtSize(type, 4.8);
  page.drawText(type, { x: x + CARD_WIDTH - 29.5 - typeWidth / 2, y: y + CARD_HEIGHT - 21.1, size: 4.8, font: assets.bold, color: p.primary });

  drawPortrait(page, assets, card, x + 26, y + 36, 62, 74, p);
  const infoX = x + 99;
  fitText(page, assets.bold, card.personName, infoX, y + 104, 130, 10.9, INK, 6.7);
  page.drawRectangle({ x: infoX, y: y + 97.2, width: 53, height: 1.4, color: GOLD });
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: infoX, y: y + 87, size: 3.3, font: assets.bold, color: MUTED });
  fitText(page, assets.bold, schoolId, infoX, y + 77.5, 128, 8.4, p.primary, 5.6);
  page.drawText(card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION", { x: infoX, y: y + 64, size: 3.3, font: assets.bold, color: MUTED });
  const roleText = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || descriptor) : descriptor;
  fitText(page, assets.bold, roleText, infoX, y + 54.3, 128, 6.6, INK, 4.5);
  page.drawText("CARD NO.", { x: infoX, y: y + 41.5, size: 3.2, font: assets.bold, color: MUTED });
  fitText(page, assets.regular, card.serial, infoX, y + 33.4, 128, 4.9, INK, 3.5);

  if (assets.portraits.has(card.id)) {
    const ghost = assets.portraits.get(card.id)!;
    const max = 42;
    const scale = Math.min(max / ghost.width, max / ghost.height);
    page.drawImage(ghost, { x: x + CARD_WIDTH - 49, y: y + 38, width: ghost.width * scale, height: ghost.height * scale, opacity: .045 });
  } else {
    page.drawText(initials(school.name), { x: x + CARD_WIDTH - 53, y: y + 48, size: 28, font: assets.bold, color: p.primary, opacity: .045 });
  }

  page.drawRectangle({ x: x + 18.2, y, width: CARD_WIDTH - 18.2, height: 24, color: p.primary });
  page.drawText("ISSUED", { x: x + 27, y: y + 14.5, size: 2.8, font: assets.bold, color: rgb(1, 1, 1), opacity: .7 });
  page.drawText(cardDate(card.issuedAt), { x: x + 27, y: y + 7.1, size: 4.7, font: assets.bold, color: rgb(1, 1, 1) });
  page.drawText("VALID UNTIL", { x: x + 79, y: y + 14.5, size: 2.8, font: assets.bold, color: rgb(1, 1, 1), opacity: .7 });
  page.drawText(cardDate(card.expiresAt), { x: x + 79, y: y + 7.1, size: 4.7, font: assets.bold, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: x + 139, y: y + 5.1, width: 43, height: 14, color: active ? GOLD : rgb(.68, .18, .18) });
  const statusWidth = assets.bold.widthOfTextAtSize(status, 4.8);
  page.drawText(status, { x: x + 160.5 - statusWidth / 2, y: y + 9.9, size: 4.8, font: assets.bold, color: active ? INK : rgb(1, 1, 1) });
  page.drawText("SUKUUNOVA SECURE SCHOOL ID", { x: x + 188, y: y + 10.1, size: 2.7, font: assets.bold, color: rgb(1, 1, 1), opacity: .82, maxWidth: 45 });
}

function drawBack(page: PDFPage, assets: PdfAssets, card: IdentityCardView, school: SchoolIdentityBrand, x: number, y: number) {
  const p = palette(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const matrix = assets.qr.get(card.id) ?? [];

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: IVORY, borderColor: p.primary, borderWidth: .75 });
  drawSecurityMesh(page, x, y, p);
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 30, width: CARD_WIDTH, height: 30, color: p.primary });
  page.drawRectangle({ x, y: y + CARD_HEIGHT - 33, width: CARD_WIDTH, height: 3, color: GOLD });
  drawLogo(page, assets, school, x + 10, y + CARD_HEIGHT - 26, 19, p);
  fitText(page, assets.bold, school.name.toUpperCase(), x + 36, y + CARD_HEIGHT - 14.3, 129, 7.8, rgb(1, 1, 1), 5.7);
  page.drawText("LIVE CREDENTIAL VERIFICATION", { x: x + 36, y: y + CARD_HEIGHT - 23.4, size: 3.7, font: assets.bold, color: GOLD, maxWidth: 129 });

  const leftX = x + 14;
  page.drawText(card.personType === "student" ? "STUDENT ID" : "STAFF ID", { x: leftX, y: y + 105, size: 3.2, font: assets.bold, color: MUTED });
  fitText(page, assets.bold, schoolId, leftX, y + 95.5, 128, 7.7, p.primary, 5.2);
  page.drawText(card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION", { x: leftX, y: y + 82, size: 3.2, font: assets.bold, color: MUTED });
  fitText(page, assets.bold, roleLine, leftX, y + 72.5, 128, 6.1, INK, 4.1);
  page.drawText(card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT", { x: leftX, y: y + 59, size: 3.2, font: assets.bold, color: MUTED });
  fitText(page, assets.bold, contact1, leftX, y + 49.8, 128, 5.7, INK, 3.9);
  fitText(page, assets.regular, contact2, leftX, y + 41.8, 128, 4.6, MUTED, 3.4);

  const qrSize = 76;
  const qrX = x + CARD_WIDTH - qrSize - 10;
  const qrY = y + 38;
  page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 14, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: .55 });
  drawQr(page, matrix, qrX, qrY + 2, qrSize);
  page.drawText("SCAN · VERIFY LIVE", { x: qrX, y: qrY - 1.8, size: 4.1, font: assets.bold, color: p.primary, maxWidth: qrSize });
  page.drawText("Authenticity + current status", { x: qrX, y: qrY - 7.8, size: 2.9, font: assets.regular, color: MUTED, maxWidth: qrSize });

  page.drawLine({ start: { x: leftX, y: y + 31.5 }, end: { x: leftX + 70, y: y + 31.5 }, thickness: .55, color: LINE });
  page.drawText("AUTHORISED SIGNATURE", { x: leftX, y: y + 25, size: 2.9, font: assets.bold, color: MUTED });
  page.drawText(`SCHOOL CODE · ${short(school.uniqueCode, 18)}`, { x: leftX + 83, y: y + 25.2, size: 3.3, font: assets.bold, color: p.primary, maxWidth: 64 });
  fitText(page, assets.regular, card.serial, leftX, y + 17.7, 144, 3.2, MUTED, 2.7);

  page.drawRectangle({ x, y, width: CARD_WIDTH, height: 13, color: p.primary });
  fitText(page, assets.regular, `If found, return to ${school.name}. School credential only · not a national identity document.`, x + 12, y + 4.4, CARD_WIDTH - 24, 3.05, rgb(1, 1, 1), 2.55);
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
  page.drawText(school.name, { x: 48, y: A4_HEIGHT - 22, size: 8, font: assets.bold, color: INK, maxWidth: A4_WIDTH - 96 });
  page.drawText(title, { x: 48, y: A4_HEIGHT - 34, size: 6, font: assets.bold, color: MUTED, maxWidth: A4_WIDTH - 96 });
  page.drawText(footer, { x: 48, y: 12, size: 5, font: assets.bold, color: MUTED, maxWidth: A4_WIDTH - 96 });
  drawRegistration(page, A4_HEIGHT - 43);
  drawRegistration(page, 43);
}

export async function buildIdentityCardSinglePdfV3(card: IdentityCardView, school: SchoolIdentityBrand, origin: string) {
  const doc = await PDFDocument.create();
  const assets = await prepareAssets(doc, school, [card], origin);
  const front = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawFront(front, assets, card, school, 0, 0);
  const back = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  drawBack(back, assets, card, school, 0, 0);
  doc.setTitle(`${school.name} · ${card.personName} · secure school ID`);
  doc.setSubject("Premium two-sided CR80 school identity credential with live QR verification");
  return Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
}

export async function buildIdentityCardBulkPdfV3(cards: IdentityCardView[], school: SchoolIdentityBrand, origin: string) {
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

  doc.setTitle(`${school.name} · premium duplex school ID print pack`);
  doc.setSubject("Cut-ready A4 duplex sheets containing premium CR80 student and staff identity cards");
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

function svgQr(value: string, x: number, y: number, size: number) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  if (!count) return "";
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  let blocks = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        blocks += `<rect x="${(x + (column + quiet) * unit).toFixed(2)}" y="${(y + (row + quiet) * unit).toFixed(2)}" width="${(unit + .08).toFixed(2)}" height="${(unit + .08).toFixed(2)}" fill="${INK_HEX}"/>`;
      }
    }
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/>${blocks}`;
}

function svgShell(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="85.6mm" height="53.98mm" viewBox="0 0 856 539.8" role="img">${content}</svg>`;
}

function svgSecurity(primary: string, accent: string) {
  const rings = Array.from({ length: 9 }, (_, i) => `<circle cx="670" cy="300" r="${72 + i * 24}" fill="none" stroke="${i % 2 ? primary : GOLD_HEX}" stroke-width="2" opacity="0.055"/>`).join("");
  const lines = Array.from({ length: 13 }, (_, i) => `<path d="M${i * 76 - 250} 540 L${i * 76 + 90} 0" stroke="${i % 2 ? accent : GOLD_HEX}" stroke-width="2" opacity="0.04"/>`).join("");
  return `${rings}${lines}`;
}

export function buildIdentityCardSvgV3(card: IdentityCardView, school: SchoolIdentityBrand, origin: string, side: IdentityCardArtworkSide) {
  const p = palette(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student" ? ([card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && !card.isExpired;
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  const logo = svgImageOrInitials(school.logoUrl, school.name, 89, 28, 88, 88, p.primaryHex, "logoClip", "meet");

  if (side === "front") {
    const portrait = svgImageOrInitials(card.photoUrl, card.personName, 91, 169, 219, 257, p.primaryHex, "portraitClip", "slice");
    return svgShell(`<defs><clipPath id="logoClip"><rect x="89" y="28" width="88" height="88"/></clipPath><clipPath id="portraitClip"><rect x="91" y="169" width="219" height="257"/></clipPath></defs><rect width="856" height="539.8" rx="26" fill="${IVORY_HEX}"/>${svgSecurity(p.primaryHex,p.accentHex)}<rect width="54" height="539.8" fill="${p.primaryHex}"/><rect x="54" width="11" height="539.8" fill="${GOLD_HEX}"/><rect x="65" width="791" height="8" fill="${p.accentHex}"/><rect x="89" y="28" width="88" height="88" fill="#fff" stroke="${GOLD_HEX}" stroke-width="4"/>${logo}<text x="203" y="66" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="${p.primaryHex}">${xml(short(school.name.toUpperCase(),30))}</text><text x="204" y="98" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${card.personType === "student" ? "STUDENT IDENTITY CARD" : "STAFF IDENTITY CARD"}</text><rect x="700" y="42" width="117" height="42" rx="21" fill="${p.primaryHex}" opacity=".09" stroke="${p.primaryHex}"/><text x="758" y="69" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="900" fill="${p.primaryHex}">${card.personType === "student" ? "STUDENT" : "STAFF"}</text><rect x="83" y="161" width="235" height="273" fill="${GOLD_HEX}"/><rect x="91" y="169" width="219" height="257" fill="#f2f1ec"/>${portrait}<text x="349" y="202" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="900" fill="${INK_HEX}">${xml(short(card.personName,27))}</text><rect x="349" y="220" width="180" height="6" rx="3" fill="${GOLD_HEX}"/><text x="349" y="260" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="349" y="301" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="${p.primaryHex}">${xml(short(schoolId,28))}</text><text x="349" y="346" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</text><text x="349" y="381" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="800" fill="${INK_HEX}">${xml(short(roleLine,32))}</text><text x="349" y="420" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">CARD NO.</text><text x="349" y="445" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="${INK_HEX}">${xml(short(card.serial,39))}</text><rect x="65" y="455" width="791" height="84.8" fill="${p.primaryHex}"/><text x="97" y="486" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4" fill="#ffffff" opacity=".7">ISSUED</text><text x="97" y="514" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="#fff">${xml(cardDate(card.issuedAt))}</text><text x="281" y="486" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4" fill="#ffffff" opacity=".7">VALID UNTIL</text><text x="281" y="514" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="#fff">${xml(cardDate(card.expiresAt))}</text><rect x="491" y="478" width="142" height="43" rx="4" fill="${active ? GOLD_HEX : "#A92F2F"}"/><text x="562" y="506" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="900" fill="${active ? INK_HEX : "#fff"}">${status}</text><text x="659" y="501" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1" fill="#fff" opacity=".85">SUKUUNOVA SECURE SCHOOL ID</text><rect x="1.5" y="1.5" width="853" height="536.8" rx="25" fill="none" stroke="${p.primaryHex}" stroke-width="3"/>`);
  }

  const contactLabel = card.personType === "student" ? "GUARDIAN / EMERGENCY" : "CONTACT";
  const contact1 = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contact2 = card.personType === "student" ? (card.guardianPhone || "Contact school office") : (card.contactEmail || "School staff account");
  const qrUrl = identityCardCompactVerificationUrl(origin, school.uniqueCode, card);
  const qr = svgQr(qrUrl, 560, 165, 268);
  return svgShell(`<defs><clipPath id="logoClip"><rect x="34" y="27" width="68" height="68"/></clipPath></defs><rect width="856" height="539.8" rx="26" fill="${IVORY_HEX}"/>${svgSecurity(p.primaryHex,p.accentHex)}<rect width="856" height="112" rx="26" fill="${p.primaryHex}"/><rect y="102" width="856" height="11" fill="${GOLD_HEX}"/><rect x="34" y="27" width="68" height="68" fill="#fff" stroke="${GOLD_HEX}" stroke-width="3"/>${svgImageOrInitials(school.logoUrl, school.name, 34, 27, 68, 68, p.primaryHex, "logoClip", "meet")}<text x="128" y="60" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="900" fill="#fff">${xml(short(school.name.toUpperCase(),30))}</text><text x="129" y="87" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="900" letter-spacing="2" fill="${GOLD_HEX}">LIVE CREDENTIAL VERIFICATION</text><text x="49" y="155" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text><text x="49" y="190" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="900" fill="${p.primaryHex}">${xml(short(schoolId,29))}</text><text x="49" y="235" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</text><text x="49" y="268" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="800" fill="${INK_HEX}">${xml(short(roleLine,34))}</text><text x="49" y="313" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="2" fill="${MUTED_HEX}">${contactLabel}</text><text x="49" y="346" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="800" fill="${INK_HEX}">${xml(short(contact1,36))}</text><text x="49" y="374" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="${MUTED_HEX}">${xml(short(contact2,44))}</text><line x1="49" y1="421" x2="275" y2="421" stroke="${LINE_HEX}" stroke-width="2"/><text x="49" y="443" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.3" fill="${MUTED_HEX}">AUTHORISED SIGNATURE</text><text x="332" y="433" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900" fill="${p.primaryHex}">SCHOOL CODE · ${xml(short(school.uniqueCode,18))}</text><text x="49" y="469" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="${MUTED_HEX}">${xml(short(card.serial,46))}</text><rect x="548" y="153" width="292" height="312" rx="12" fill="#fff" stroke="${LINE_HEX}" stroke-width="2"/>${qr}<text x="694" y="451" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" fill="${p.primaryHex}">SCAN · VERIFY LIVE</text><text x="694" y="472" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="${MUTED_HEX}">Authenticity + current status</text><rect y="492" width="856" height="47.8" fill="${p.primaryHex}"/><text x="428" y="522" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10.5" fill="#fff">If found, return to ${xml(short(school.name,42))}. School credential only · not a national identity document.</text><rect x="1.5" y="1.5" width="853" height="536.8" rx="25" fill="none" stroke="${p.primaryHex}" stroke-width="3"/>`);
}
