import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TenantDb } from "./db";
import { withTenant } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import encodeQR from "qr";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  translate,
  pushGraphicsState,
  popGraphicsState,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

export const DEFAULT_VALIDITY_MONTHS = 24;
export const MAX_BULK_CARDS = 2000;
const PT_PER_MM = 72 / 25.4;
const CARD_WIDTH = 85.6 * PT_PER_MM;
const CARD_HEIGHT = 53.98 * PT_PER_MM;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

type CardRow = {
  id: string;
  schoolId: string;
  personType: "student" | "staff";
  studentId: string | null;
  staffId: string | null;
  serial: string;
  issuedAt: Date;
  expiresAt: Date;
  status: "active" | "revoked";
  version: number;
  personName: string;
  admissionNo: string | null;
  classId: string | null;
  className: string | null;
  roleName: string | null;
  photoUrl: string | null;
};

export type IdentityCardKind = "student" | "staff";
export type IdentityCardScope = "all" | IdentityCardKind | "class" | "selected";
export type IdentityCardView = CardRow & { isExpired: boolean; photoReady: boolean };

function secret() {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR");
  return createHash("sha256").update(`${value}:identity-card:v1`).digest();
}

function canonical(card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">) {
  return ["sukuunova-id-card-v1", card.schoolId, card.serial, card.personType, card.issuedAt.toISOString(), card.expiresAt.toISOString(), String(card.version)].join("|");
}

export function identityCardSignature(card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">) {
  return createHmac("sha256", secret()).update(canonical(card)).digest("hex");
}

export function identityCardVerificationPath(schoolCode: string, serial: string) {
  return `/verify/id-card/${encodeURIComponent(schoolCode)}/${encodeURIComponent(serial)}`;
}

export function identityCardVerificationUrl(origin: string, schoolCode: string, card: CardRow) {
  return `${origin.replace(/\/+$/g, "")}${identityCardVerificationPath(schoolCode, card.serial)}?sig=${identityCardSignature(card)}`;
}

export function verifyIdentityCardSignature(
  card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">,
  supplied: string,
) {
  const normalized = supplied.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return false;
  const expected = identityCardSignature(card);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
}

function expiry(from: Date) {
  const value = new Date(from);
  value.setUTCMonth(value.getUTCMonth() + DEFAULT_VALIDITY_MONTHS);
  return value;
}

function cleanCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "SCHOOL";
}

function serial(schoolCode: string, kind: IdentityCardKind) {
  return `SNV-${cleanCode(schoolCode)}-${kind === "student" ? "ST" : "SF"}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

async function allocateSerial(tx: TenantDb, schoolId: string, schoolCode: string, kind: IdentityCardKind) {
  for (let i = 0; i < 8; i += 1) {
    const value = serial(schoolCode, kind);
    const hit = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "IdentityCard" WHERE "schoolId"=$1 AND "serial"=$2 LIMIT 1`,
      schoolId,
      value,
    );
    if (!hit[0]) return value;
  }
  throw new AppError("Unable to allocate a unique identity card number.", 500, "CARD_SERIAL_ALLOCATION_FAILED");
}

async function insertCard(tx: TenantDb, schoolId: string, schoolCode: string, kind: IdentityCardKind, personId: string, now: Date) {
  const id = `ic_${randomBytes(12).toString("hex")}`;
  const value = await allocateSerial(tx, schoolId, schoolCode, kind);
  const expiresAt = expiry(now);
  if (kind === "student") {
    await tx.$queryRawUnsafe(
      `INSERT INTO "IdentityCard" ("id","schoolId","personType","studentId","serial","issuedAt","expiresAt","status","version","createdAt","updatedAt") VALUES ($1,$2,'student',$3,$4,$5,$6,'active',1,$5,$5)`,
      id, schoolId, personId, value, now, expiresAt,
    );
  } else {
    await tx.$queryRawUnsafe(
      `INSERT INTO "IdentityCard" ("id","schoolId","personType","staffId","serial","issuedAt","expiresAt","status","version","createdAt","updatedAt") VALUES ($1,$2,'staff',$3,$4,$5,$6,'active',1,$5,$5)`,
      id, schoolId, personId, value, now, expiresAt,
    );
  }
  return { id, serial: value };
}

async function staffPeople(tx: TenantDb, schoolId: string) {
  return tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT u."id",u."name" FROM "User" u
     WHERE u."schoolId"=$1 AND u."status"='active'
       AND EXISTS (
         SELECT 1 FROM "UserRole" ur
         JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
         WHERE ur."schoolId"=$1 AND ur."userId"=u."id" AND r."name" NOT IN ('Parent','Student')
       )
     ORDER BY u."name" COLLATE "C"`,
    schoolId,
  );
}

export async function ensureIdentityCardsForSchool(tx: TenantDb, schoolId: string, schoolCode: string, actorId = "system") {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity-cards:${schoolId}`}))`;
  const [students, staff, existing] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Student" WHERE "schoolId"=$1 AND "status"='active'`, schoolId),
    staffPeople(tx, schoolId),
    tx.$queryRawUnsafe<Array<{ id: string; personType: IdentityCardKind; studentId: string | null; staffId: string | null }>>(
      `SELECT "id","personType","studentId","staffId" FROM "IdentityCard" WHERE "schoolId"=$1 AND "status"='active'`, schoolId,
    ),
  ]);
  const studentSet = new Set(students.map((row) => row.id));
  const staffSet = new Set(staff.map((row) => row.id));
  const stale = existing.filter((row) => row.personType === "student" ? (!row.studentId || !studentSet.has(row.studentId)) : (!row.staffId || !staffSet.has(row.staffId)));
  const now = new Date();
  for (const card of stale) {
    await tx.$executeRawUnsafe(
      `UPDATE "IdentityCard" SET "status"='revoked',"version"="version"+1,"updatedAt"=$3 WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active'`,
      schoolId, card.id, now,
    );
  }
  const studentCardSet = new Set(existing.filter((row) => row.personType === "student" && row.studentId && studentSet.has(row.studentId)).map((row) => row.studentId));
  const staffCardSet = new Set(existing.filter((row) => row.personType === "staff" && row.staffId && staffSet.has(row.staffId)).map((row) => row.staffId));
  let created = 0;
  for (const student of students) if (!studentCardSet.has(student.id)) { await insertCard(tx, schoolId, schoolCode, "student", student.id, now); created += 1; }
  for (const staffMember of staff) if (!staffCardSet.has(staffMember.id)) { await insertCard(tx, schoolId, schoolCode, "staff", staffMember.id, now); created += 1; }
  if ((created || stale.length) && actorId !== "system") {
    await appendSchoolAudit(tx, {
      schoolId,
      actorId,
      action: "identity_cards.reconciled",
      entityType: "IdentityCard",
      entityId: `${schoolId}:${now.toISOString()}`,
      after: { created, revokedStale: stale.length, activeStudents: students.length, activeStaff: staff.length },
    });
  }
  return { created, revokedStale: stale.length, totalPeople: students.length + staff.length };
}

export async function listIdentityCards(tx: TenantDb, schoolId: string, schoolCode: string, actorId: string): Promise<IdentityCardView[]> {
  await ensureIdentityCardsForSchool(tx, schoolId, schoolCode, actorId);
  const rows = await tx.$queryRawUnsafe<CardRow[]>(
    `SELECT c."id",c."schoolId",c."personType",c."studentId",c."staffId",c."serial",c."issuedAt",c."expiresAt",c."status",c."version",
            COALESCE(s."name",u."name") AS "personName",s."admissionNo",s."classId",cl."name" AS "className",
            CASE WHEN c."personType"='staff' THEN (
              SELECT r."name" FROM "UserRole" ur
              JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
              WHERE ur."schoolId"=c."schoolId" AND ur."userId"=u."id"
              ORDER BY CASE WHEN r."name"='Owner' THEN 0 ELSE 1 END,r."name" LIMIT 1
            ) ELSE NULL END AS "roleName",
            COALESCE(s."photoUrl",u."photoUrl") AS "photoUrl"
     FROM "IdentityCard" c
     LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
     LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
     LEFT JOIN "User" u ON u."id"=c."staffId" AND u."schoolId"=c."schoolId"
     WHERE c."schoolId"=$1
     ORDER BY c."personType",COALESCE(s."name",u."name") COLLATE "C"`,
    schoolId,
  );
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    isExpired: row.expiresAt.getTime() <= now || row.status !== "active",
    photoReady: Boolean(photoData(row.photoUrl)),
  }));
}

export async function getIdentityCardsByScope(
  tx: TenantDb,
  schoolId: string,
  schoolCode: string,
  scope: IdentityCardScope,
  ids: string[] = [],
  actorId: string,
  classId?: string | null,
) {
  const all = await listIdentityCards(tx, schoolId, schoolCode, actorId);
  if (scope === "all") return all;
  if (scope === "student" || scope === "staff") return all.filter((row) => row.personType === scope);
  if (scope === "class") {
    const normalized = classId?.trim();
    if (!normalized) throw new AppError("classId is required for a class identity-card pack.", 400, "CLASS_REQUIRED");
    const classes = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Class" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, normalized);
    if (!classes[0]) throw new AppError("Class not found.", 404, "CLASS_NOT_FOUND");
    return all.filter((row) => row.personType === "student" && row.classId === normalized);
  }
  if (scope === "selected") {
    const wanted = new Set(ids);
    return all.filter((row) => wanted.has(row.id));
  }
  throw new AppError("Unknown identity-card scope.", 400, "INVALID_SCOPE");
}

function photoData(value: string | null) {
  if (!value?.startsWith("data:")) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 2_500_000) return null;
  return { mime: match[1].toLowerCase(), bytes };
}

function hexColor(value: string | undefined, fallback: [number, number, number]) {
  const match = value?.match(/^#?([0-9a-f]{6})$/i);
  return match ? rgb(parseInt(match[1].slice(0, 2), 16) / 255, parseInt(match[1].slice(2, 4), 16) / 255, parseInt(match[1].slice(4, 6), 16) / 255) : rgb(...fallback);
}

function palette(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    primary: hexColor(typeof row.primary === "string" ? row.primary : typeof row.primaryColor === "string" ? row.primaryColor : undefined, [.06, .16, .26]),
    accent: hexColor(typeof row.accent === "string" ? row.accent : typeof row.secondary === "string" ? row.secondary : undefined, [.85, .65, .12]),
  };
}

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>) {
  let fontSize = size;
  while (fontSize > 5 && font.widthOfTextAtSize(text, fontSize) > width) fontSize -= .25;
  page.drawText(text, { x, y, size: fontSize, font, color, maxWidth: width });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "SN";
}

function qrMatrix(value: string) {
  const raw = encodeQR(value, "raw", { ecc: "high" }) as unknown;
  return Array.isArray(raw) ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>)) : [];
}

function drawQr(page: PDFPage, matrix: unknown[][], x: number, y: number, size: number, dark: ReturnType<typeof rgb>) {
  const count = matrix.length;
  if (!count) return;
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        page.drawRectangle({ x: x + (column + quiet) * unit, y: y + (count - row - 1 + quiet) * unit, width: unit + .08, height: unit + .08, color: dark });
      }
    }
  }
}

async function drawHeaderMark(doc: PDFDocument, page: PDFPage, school: { name: string; logoUrl: string | null }, accent: ReturnType<typeof rgb>, primary: ReturnType<typeof rgb>) {
  const logo = photoData(school.logoUrl);
  if (logo) {
    try {
      const image = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const scale = Math.min(20 / image.width, 20 / image.height);
      page.drawImage(image, { x: 7 + (20 - image.width * scale) / 2, y: CARD_HEIGHT - 27 + (20 - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      return;
    } catch { /* fall back to initials */ }
  }
  page.drawCircle({ x: 17, y: CARD_HEIGHT - 17, size: 10, color: accent });
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  fitText(page, bold, initials(school.name), 10, CARD_HEIGHT - 19, 14, 5.5, primary);
}

async function drawCard(
  doc: PDFDocument,
  page: PDFPage,
  card: CardRow,
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown },
  origin: string,
  x: number,
  y: number,
) {
  const { primary, accent } = palette(school.brandColors);
  const white = rgb(1, 1, 1), muted = rgb(.36, .42, .48), border = rgb(.83, .86, .9), light = rgb(.965, .975, .985), green = rgb(.08, .45, .24), dark = rgb(.055, .12, .18), red = rgb(.67, .12, .12);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  page.pushOperators(pushGraphicsState(), translate(x, y));
  page.drawRectangle({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, color: white, borderColor: primary, borderWidth: .8 });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 34, width: CARD_WIDTH, height: 34, color: primary });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 38, width: CARD_WIDTH, height: 4, color: accent });
  await drawHeaderMark(doc, page, school, accent, primary);
  fitText(page, bold, school.name.toUpperCase(), 33, CARD_HEIGHT - 12.2, CARD_WIDTH - 43, 9.2, white);
  page.drawText(card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD", { x: 33, y: CARD_HEIGHT - 25, size: 4.8, font: bold, color: accent, maxWidth: CARD_WIDTH - 43 });

  const photoX = 8, photoY = 28, photoWidth = 55, photoHeight = 68;
  page.drawRectangle({ x: photoX, y: photoY, width: photoWidth, height: photoHeight, color: light, borderColor: accent, borderWidth: 1 });
  const photo = photoData(card.photoUrl);
  if (photo) {
    try {
      const image = photo.mime.includes("png") ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
      const scale = Math.max(photoWidth / image.width, photoHeight / image.height);
      const width = image.width * scale, height = image.height * scale;
      page.drawImage(image, { x: photoX + (photoWidth - width) / 2, y: photoY + (photoHeight - height) / 2, width, height });
    } catch {
      fitText(page, bold, initials(card.personName), 15, photoY + 28, 40, 20, primary);
    }
  } else {
    fitText(page, bold, initials(card.personName), 15, photoY + 28, 40, 20, primary);
  }

  const detailsX = 70;
  fitText(page, bold, card.personName, detailsX, CARD_HEIGHT - 50, 158, 11, dark);
  page.drawLine({ start: { x: detailsX, y: CARD_HEIGHT - 55 }, end: { x: detailsX + 72, y: CARD_HEIGHT - 55 }, thickness: 1.2, color: accent });
  page.drawText("IDENTIFICATION", { x: detailsX, y: CARD_HEIGHT - 65, size: 4.2, font: bold, color: muted });
  fitText(page, bold, card.personType === "student" ? (card.admissionNo || card.serial) : (card.roleName || "STAFF MEMBER"), detailsX, CARD_HEIGHT - 74, 158, 7.3, primary);
  page.drawText(card.personType === "student" ? "CLASS" : "CARD SERIAL", { x: detailsX, y: CARD_HEIGHT - 84, size: 4.2, font: bold, color: muted });
  fitText(page, regular, card.personType === "student" ? (card.className || "Not assigned") : card.serial, detailsX, CARD_HEIGHT - 93, 158, 6.2, dark);

  page.drawRectangle({ x: 8, y: 18, width: 95, height: 17, color: light, borderColor: border, borderWidth: .5 });
  page.drawText("ISSUED", { x: 12, y: 28.4, size: 3.4, font: bold, color: muted });
  page.drawText(card.issuedAt.toISOString().slice(0, 10), { x: 12, y: 22, size: 5.3, font: bold, color: primary });
  page.drawText("EXPIRES", { x: 58, y: 28.4, size: 3.4, font: bold, color: muted });
  page.drawText(card.expiresAt.toISOString().slice(0, 10), { x: 58, y: 22, size: 5.3, font: bold, color: primary });

  const active = card.status === "active" && card.expiresAt.getTime() > Date.now();
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  page.drawRectangle({ x: 108, y: 18, width: 43, height: 15, color: active ? rgb(.92, .97, .94) : rgb(.98, .93, .93), borderColor: active ? rgb(.62, .83, .67) : rgb(.84, .55, .55), borderWidth: .45 });
  const statusWidth = bold.widthOfTextAtSize(status, 5);
  page.drawText(status, { x: 129.5 - statusWidth / 2, y: 23, size: 5, font: bold, color: active ? green : red });

  drawQr(page, qrMatrix(identityCardVerificationUrl(origin, school.uniqueCode, card)), CARD_WIDTH - 54, 9, 45, primary);
  page.drawText("SCAN TO VERIFY", { x: CARD_WIDTH - 54, y: 3, size: 4, font: bold, color: primary, maxWidth: 45 });
  page.drawText("Official school identification · Not a national identity document", { x: 8, y: 5.3, size: 3.1, font: regular, color: muted, maxWidth: 145 });
  page.pushOperators(popGraphicsState());
}

export async function buildSingleIdentityCardPdf(card: CardRow, school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown }, origin: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  await drawCard(doc, page, card, school, origin, 0, 0);
  return Buffer.from(await doc.save());
}

export async function buildIdentityCardPdf(cards: CardRow[], school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown }, origin: string) {
  if (!cards.length) throw new AppError("No identity cards matched this selection.", 404, "NO_CARDS");
  if (cards.length > MAX_BULK_CARDS) throw new AppError(`A single print pack can contain at most ${MAX_BULK_CARDS} cards.`, 413, "TOO_MANY_CARDS");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gapX = 8, gapY = 8, gridWidth = 2 * CARD_WIDTH + gapX, marginX = (A4_WIDTH - gridWidth) / 2;
  for (let i = 0; i < cards.length; i += 8) {
    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawText(school.name, { x: marginX, y: A4_HEIGHT - 18, size: 7, font: bold, color: rgb(.25, .29, .34), maxWidth: gridWidth });
    const batch = cards.slice(i, i + 8);
    for (let j = 0; j < batch.length; j += 1) {
      const column = j % 2, row = Math.floor(j / 2);
      await drawCard(doc, page, batch[j], school, origin, marginX + column * (CARD_WIDTH + gapX), A4_HEIGHT - 36 - (row + 1) * CARD_HEIGHT - row * gapY);
    }
    page.drawText(`SukuuNova identity card print pack · ${i + 1}-${Math.min(i + 8, cards.length)} of ${cards.length}`, { x: marginX, y: 18, size: 5.5, font, color: rgb(.42, .46, .5) });
  }
  return Buffer.from(await doc.save());
}

export async function reissueIdentityCard(tx: TenantDb, input: { schoolId: string; actorId: string; cardId: string }) {
  await requirePermission(tx, input.actorId, "identity_cards:manage");
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; personType: IdentityCardKind; studentId: string | null; staffId: string | null; serial: string }>>(
    `SELECT "id","personType","studentId","staffId","serial" FROM "IdentityCard" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.cardId,
  );
  const card = rows[0];
  if (!card) throw new AppError("Identity card not found.", 404, "CARD_NOT_FOUND");
  const personId = card.personType === "student" ? card.studentId : card.staffId;
  if (!personId) throw new AppError("Identity card has no owner.", 500, "CARD_CORRUPT");
  const status = card.personType === "student"
    ? await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, personId)
    : await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "User" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, personId);
  if (status[0]?.status !== "active") throw new AppError("Inactive people cannot receive a new identity card.", 409, "PERSON_INACTIVE");
  const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { uniqueCode: true } });
  if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
  const column = card.personType === "student" ? "studentId" : "staffId";
  const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "IdentityCard" WHERE "schoolId"=$1 AND "${column}"=$2 AND "status"='active' ORDER BY "createdAt" DESC LIMIT 1`, input.schoolId, personId,
  );
  const now = new Date(), activeId = active[0]?.id ?? card.id;
  await tx.$executeRawUnsafe(`UPDATE "IdentityCard" SET "status"='revoked',"version"="version"+1,"updatedAt"=$3 WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, activeId, now);
  const created = await insertCard(tx, input.schoolId, school.uniqueCode, card.personType, personId, now);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "identity_card.reissued", entityType: "IdentityCard", entityId: created.id, before: { revokedCardId: activeId, previousSerial: card.serial }, after: { serial: created.serial } });
  return created;
}

export async function revokeIdentityCard(tx: TenantDb, input: { schoolId: string; actorId: string; cardId: string }) {
  await requirePermission(tx, input.actorId, "identity_cards:manage");
  const rows = await tx.$queryRawUnsafe<Array<{ status: string; version: number; serial: string }>>(`SELECT "status","version","serial" FROM "IdentityCard" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.cardId);
  if (!rows[0]) throw new AppError("Identity card not found.", 404, "CARD_NOT_FOUND");
  if (rows[0].status === "revoked") throw new AppError("This identity card is already revoked.", 409, "CARD_ALREADY_REVOKED");
  const version = rows[0].version + 1;
  await tx.$executeRawUnsafe(`UPDATE "IdentityCard" SET "status"='revoked',"version"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.cardId, version);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "identity_card.revoked", entityType: "IdentityCard", entityId: input.cardId, before: rows[0], after: { status: "revoked", version, serial: rows[0].serial } });
  return { id: input.cardId, status: "revoked" as const };
}

export async function publicIdentityCardBySerial(schoolId: string, serialValue: string, signature: string) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<CardRow[]>(
      `SELECT c."id",c."schoolId",c."personType",c."studentId",c."staffId",c."serial",c."issuedAt",c."expiresAt",c."status",c."version",
              COALESCE(s."name",u."name") AS "personName",s."admissionNo",s."classId",cl."name" AS "className",
              CASE WHEN c."personType"='staff' THEN (
                SELECT r."name" FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
                WHERE ur."schoolId"=c."schoolId" AND ur."userId"=u."id" ORDER BY r."name" LIMIT 1
              ) ELSE NULL END AS "roleName",
              COALESCE(s."photoUrl",u."photoUrl") AS "photoUrl"
       FROM "IdentityCard" c
       LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
       LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
       LEFT JOIN "User" u ON u."id"=c."staffId" AND u."schoolId"=c."schoolId"
       WHERE c."schoolId"=$1 AND c."serial"=$2 LIMIT 1`,
      schoolId, serialValue,
    );
    const card = rows[0];
    if (!card || !verifyIdentityCardSignature(card, signature)) return null;
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } });
    if (!school) return null;
    const active = card.personType === "student"
      ? await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, card.studentId)
      : await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "User" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, card.staffId);
    const state = card.status === "revoked" ? "revoked" : card.expiresAt.getTime() <= Date.now() ? "expired" : active[0]?.status !== "active" ? "inactive" : "verified";
    return { card, school, state } as const;
  });
}
