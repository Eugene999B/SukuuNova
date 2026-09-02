import { createHash, randomBytes } from "node:crypto";
import type { TenantDb } from "./db";
import { withTenant } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";
import encodeQR from "qr";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

const DEFAULT_VALIDITY_MONTHS = 24;
const MAX_BULK_CARDS = 2000;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PT_PER_MM = 72 / 25.4;
const CARD_WIDTH = 85.6 * PT_PER_MM;
const CARD_HEIGHT = 53.98 * PT_PER_MM;

export type IdentityCardKind = "student" | "staff";
export type IdentityCardScope = "all" | IdentityCardKind | "selected";

type CardRow = {
  id: string;
  schoolId: string;
  personType: IdentityCardKind;
  studentId: string | null;
  staffId: string | null;
  serial: string;
  issuedAt: Date;
  expiresAt: Date;
  status: "active" | "revoked";
  version: number;
  personName: string;
  admissionNo: string | null;
  className: string | null;
  roleName: string | null;
  photoUrl: string | null;
};

function hmacSecret() {
  const secret = process.env.SCHOOL_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR");
  }
  return createHash("sha256").update(`${secret}:identity-card:v1`).digest();
}

function signPayload(payload: string) {
  const { createHmac } = requireNodeCrypto();
  return createHmac("sha256", hmacSecret()).update(payload).digest("hex");
}

function requireNodeCrypto() {
  // Kept in a tiny function so the browser never evaluates this module: all exports below are server-only.
  return { createHmac: require("node:crypto").createHmac } as typeof import("node:crypto");
}

function cleanCode(value: string) {
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return code.slice(0, 20) || "SCHOOL";
}

function cardPayload(card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">) {
  return [
    "sukuunova-id-card-v1",
    card.schoolId,
    card.serial,
    card.personType,
    card.issuedAt.toISOString(),
    card.expiresAt.toISOString(),
    String(card.version)
  ].join("|");
}

export function identityCardSignature(card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">) {
  return signPayload(cardPayload(card));
}

export function identityCardVerificationPath(schoolCode: string, card: Pick<CardRow, "serial">) {
  return `/verify/id-card/${encodeURIComponent(schoolCode)}/${encodeURIComponent(card.serial)}`;
}

export function identityCardVerificationUrl(origin: string, schoolCode: string, card: CardRow) {
  const base = origin.replace(/\/+$/, "");
  return `${base}${identityCardVerificationPath(schoolCode, card)}?sig=${identityCardSignature(card)}`;
}

export function verifyIdentityCardSignature(card: Pick<CardRow, "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version">, supplied: string) {
  const expected = identityCardSignature(card);
  const normalized = supplied.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized) || normalized.length !== expected.length) return false;
  const { timingSafeEqual } = requireNodeCrypto();
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(normalized, "utf8"));
}

function cardExpiry(issueDate = new Date()) {
  const expires = new Date(issueDate);
  expires.setUTCMonth(expires.getUTCMonth() + DEFAULT_VALIDITY_MONTHS);
  return expires;
}

function randomSerial(schoolCode: string, type: IdentityCardKind) {
  const segment = type === "student" ? "ST" : "SF";
  return `SNV-${cleanCode(schoolCode)}-${segment}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function uniqueSerial(tx: TenantDb, schoolCode: string, type: IdentityCardKind) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const serial = randomSerial(schoolCode, type);
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "IdentityCard" WHERE "schoolId"=$1 AND "serial"=$2 LIMIT 1`,
      await currentSchoolId(tx),
      serial
    );
    if (!rows[0]) return serial;
  }
  throw new AppError("Unable to allocate a unique identity card number.", 500, "CARD_SERIAL_ALLOCATION_FAILED");
}

async function currentSchoolId(tx: TenantDb) {
  const rows = await tx.$queryRaw<Array<{ value: string | null }>>`SELECT current_setting('app.current_school_id', true) AS value`;
  return rows[0]?.value ?? "";
}

async function staffPersonQuery(tx: TenantDb, schoolId: string) {
  return tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT u."id",u."name"
       FROM "User" u
      WHERE u."schoolId"=$1
        AND u."status"='active'
        AND EXISTS (
          SELECT 1
            FROM "UserRole" ur
            JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
           WHERE ur."schoolId"=$1
             AND ur."userId"=u."id"
             AND r."name" NOT IN ('Parent','Student')
        )
      ORDER BY u."name" COLLATE "C"\`,
    schoolId
  );
}

export async function ensureIdentityCardsForSchool(tx: TenantDb, schoolId: string, schoolCode: string) {
  const [students, staff] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `SELECT "id","name" FROM "Student" WHERE "schoolId"=$1 AND "status"='active'`,
      schoolId
    ),
    staffPersonQuery(tx, schoolId)
  ]);

  const existing = await tx.$queryRawUnsafe<Array<{ personType: IdentityCardKind; studentId: string | null; staffId: string | null }>>(
    `SELECT "personType","studentId","staffId" FROM "IdentityCard" WHERE "schoolId"=$1 AND "status"='active'`,
    schoolId
  );
  const studentSet = new Set(existing.filter((row) => row.personType === "student" && row.studentId).map((row) => row.studentId));
  const staffSet = new Set(existing.filter((row) => row.personType === "staff" && row.staffId).map((row) => row.staffId));

  let created = 0;
  const now = new Date();
  for (const student of students) {
    if (studentSet.has(student.id)) continue;
    const serial = randomSerial(schoolCode, "student");
    await tx.$queryRawUnsafe(
      `INSERT INTO "IdentityCard" ("id","schoolId","personType","studentId","serial","issuedAt","expiresAt","status","version","createdAt","updatedAt") VALUES ($1,$2,'student',$3,$4,$5,$6,'active',1,$5,$5)`,
      `ic_${randomBytes(12).toString("hex")}`,
      schoolId,
      student.id,
      serial,
      now,
      cardExpiry(now)
    );
    created += 1;
  }
  for (const staffMember of staff) {
    if (staffSet.has(staffMember.id)) continue;
    const serial = randomSerial(schoolCode, "staff");
    await tx.$queryRawUnsafe(
      `INSERT INTO "IdentityCard" ("id","schoolId","personType","staffId","serial","issuedAt","expiresAt","status","version","createdAt","updatedAt") VALUES ($1,$2,'staff',$3,$4,$5,$6,'active',1,$5,$5)`,
      `ic_${randomBytes(12).toString("hex")}`,
      schoolId,
      staffMember.id,
      serial,
      now,
      cardExpiry(now)
    );
    created += 1;
  }
  if (created > 0) {
    await appendSchoolAudit(tx, {
      schoolId,
      actorId: "system",
      action: "identity_cards.reconciled",
      entityType: "IdentityCard",
      entityId: `${schoolId}:${now.toISOString()}`,
      after: { created, students: students.length, staff: staff.length }
    });
  }
  return { created, totalPeople: students.length + staff.length };
}

export async function listIdentityCards(
  tx: TenantDb,
  schoolId: string,
  schoolCode: string
) {
  await requirePermission(tx, "system", "identity_cards:manage").catch(() => undefined);
  await ensureIdentityCardsForSchool(tx, schoolId, schoolCode);
  const rows = await tx.$queryRawUnsafe<CardRow[]>(
    `SELECT c."id",c."schoolId",c."personType",c."studentId",c."staffId",c."serial",c."issuedAt",c."expiresAt",c."status",c."version",
            COALESCE(s."name",u."name") AS "personName",
            s."admissionNo",
            cl."name" AS "className",
            CASE WHEN c."personType"='staff' THEN (
              SELECT r."name" FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
               WHERE ur."schoolId"=c."schoolId" AND ur."userId"=u."id" ORDER BY CASE WHEN r."name" IN ('Owner','Principal','Vice Principal','Academic Coordinator','Department Head') THEN 0 ELSE 1 END,r."name" LIMIT 1
            ) ELSE NULL END AS "roleName",
            s."photoUrl"
       FROM "IdentityCard" c
       LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
       LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
       LEFT JOIN "User" u ON u."id"=c."staffId" AND u."schoolId"=c."schoolId"
      WHERE c."schoolId"=$1
      ORDER BY c."personType", "personName" COLLATE "C"`,
    schoolId
  );
  return rows.map((row) => ({ ...row, isExpired: row.expiresAt.getTime() <= Date.now() || row.status !== "active" }));
}

export async function getIdentityCardsByScope(tx: TenantDb, schoolId: string, schoolCode: string, scope: IdentityCardScope, ids: string[] = []) {
  const all = await listIdentityCards(tx, schoolId, schoolCode);
  if (scope === "all") return all;
  if (scope === "students" || scope === "staff") return all.filter((row) => row.personType === scope);
  if (scope !== "selected") throw new AppError("Unknown identity-card selection.", 400, "INVALID_SCOPE");
  const wanted = new Set(ids);
  return all.filter((row) => wanted.has(row.id));
}

function parsePhotoDataUrl(value: string | null) {
  if (!value || !value.startsWith("data:")) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  return { mime: match[1].toLowerCase(), bytes };
}

function hexColor(value: string | undefined, fallback: [number, number, number]) {
  const match = value?.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return rgb(...fallback);
  const hex = match[1];
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function brandColors(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { primary: "#102a43", accent: "#d9ad24" };
  const row = value as Record<string, unknown>;
  return {
    primary: typeof row.primary === "string" ? row.primary : typeof row.primaryColor === "string" ? row.primaryColor : "#102a43",
    accent: typeof row.accent === "string" ? row.accent : typeof row.secondary === "string" ? row.secondary : "#d9ad24"
  };
}

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color = rgb(0.06, 0.13, 0.19)) {
  let current = size;
  while (current > 5 && font.widthOfTextAtSize(text, current) > width) current -= 0.25;
  page.drawText(text, { x, y, size: current, font, color, maxWidth: width });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "SN";
}

function drawQr(page: PDFPage, matrix: unknown[][], x: number, y: number, size: number, dark = rgb(0.04, 0.09, 0.16), light = rgb(1, 1, 1)) {
  const modules = matrix.length;
  if (!modules) return;
  const quiet = 4;
  const unit = size / (modules + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: light });
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      const cell = matrix[row]?.[col];
      const on = cell === 1 || cell === true || cell === "1";
      if (!on) continue;
      page.drawRectangle({ x: x + (col + quiet) * unit, y: y + (modules - row - 1 + quiet) * unit, width: unit + 0.15, height: unit + 0.15, color: dark });
    }
  }
}

async function drawCard(page: PDFPage, card: CardRow, school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown }, origin: string) {
  const primary = hexColor(brandColors(school.brandColors).primary, [0.06, 0.16, 0.26]);
  const accent = hexColor(brandColors(school.brandColors).accent, [0.85, 0.65, 0.12]);
  const white = rgb(1, 1, 1);
  const muted = rgb(0.36, 0.42, 0.48);
  const border = rgb(0.83, 0.86, 0.9);
  const light = rgb(0.965, 0.975, 0.985);
  const green = rgb(0.08, 0.45, 0.24);
  const darkText = rgb(0.055, 0.12, 0.18);
  const regular = await page.doc.embedFont(StandardFonts.Helvetica);
  const bold = await page.doc.embedFont(StandardFonts.HelveticaBold);
  const { height: y0 } = page.getSize();
  void y0;

  page.drawRectangle({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, color: white, borderColor: primary, borderWidth: 0.8 });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 34, width: CARD_WIDTH, height: 34, color: primary });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 38, width: CARD_WIDTH, height: 4, color: accent });

  page.drawCircle({ x: 17, y: CARD_HEIGHT - 17, size: 10, color: accent });
  page.drawText(school.name.slice(0, 3).toUpperCase(), { x: 9, y: CARD_HEIGHT - 19.2, size: 4.8, font: bold, color: primary, maxWidth: 16 });
  fitText(page, bold, school.name.toUpperCase(), 33, CARD_HEIGHT - 12.2, CARD_WIDTH - 43, 9.2, white);
  page.drawText(card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD", { x: 33, y: CARD_HEIGHT - 25.2, size: 4.8, font: bold, color: accent, maxWidth: CARD_WIDTH - 43, characterSpacing: 0.15 } as never);

  const photoX = 8;
  const photoY = 28;
  const photoW = 55;
  const photoH = 68;
  page.drawRectangle({ x: photoX, y: photoY, width: photoW, height: photoH, color: light, borderColor: accent, borderWidth: 1 });
  const photo = parsePhotoDataUrl(card.photoUrl);
  if (photo) {
    try {
      const image = photo.mime.includes("png") ? await page.doc.embedPng(photo.bytes) : await page.doc.embedJpg(photo.bytes);
      const scale = Math.min(photoW / image.width, photoH / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: photoX + (photoW - width) / 2, y: photoY + (photoH - height) / 2, width, height });
    } catch {
      page.drawText(initials(card.personName), { x: photoX + 13, y: photoY + 27, size: 18, font: bold, color: primary, maxWidth: 30 });
    }
  } else {
    fitText(page, bold, initials(card.personName), photoX + 7, photoY + 28, 40, 20, primary);
  }

  const dataX = 70;
  fitText(page, bold, card.personName, dataX, CARD_HEIGHT - 50, 158, 11, darkText);
  page.drawLine({ start: { x: dataX, y: CARD_HEIGHT - 55 }, end: { x: dataX + 72, y: CARD_HEIGHT - 55 }, thickness: 1.2, color: accent });

  page.drawText("IDENTIFICATION", { x: dataX, y: CARD_HEIGHT - 65, size: 4.2, font: bold, color: muted, maxWidth: 80 });
  fitText(page, bold, card.personType === "student" ? (card.admissionNo || card.serial) : card.roleName || "STAFF MEMBER", dataX, CARD_HEIGHT - 74, 158, 7.3, primary);

  page.drawText(card.personType === "student" ? "CLASS" : "CARD SERIAL", { x: dataX, y: CARD_HEIGHT - 84, size: 4.2, font: bold, color: muted, maxWidth: 80 });
  fitText(page, regular, card.personType === "student" ? card.className || "Not assigned" : card.serial, dataX, CARD_HEIGHT - 93, 158, 6.2, darkText);

  const datesY = 18;
  page.drawRectangle({ x: 8, y: datesY, width: 95, height: 17, color: light, borderColor: border, borderWidth: 0.5 });
  page.drawText("ISSUED", { x: 12, y: datesY + 10.4, size: 3.4, font: bold, color: muted });
  page.drawText(card.issuedAt.toISOString().slice(0, 10), { x: 12, y: datesY + 4, size: 5.3, font: bold, color: primary });
  page.drawText("EXPIRES", { x: 58, y: datesY + 10.4, size: 3.4, font: bold, color: muted });
  page.drawText(card.expiresAt.toISOString().slice(0, 10), { x: 58, y: datesY + 4, size: 5.3, font: bold, color: primary });

  const verifyUrl = identityCardVerificationUrl(origin, school.uniqueCode, card);
  const raw = encodeQR(verifyUrl, "raw", { ecc: "high" }) as unknown;
  const matrix = Array.isArray(raw) ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>)) : [];
  drawQr(page, matrix, CARD_WIDTH - 54, 10, 44, primary, white);
  page.drawText("SCAN TO VERIFY", { x: CARD_WIDTH - 54, y: 4.5, size: 4.2, font: bold, color: primary, maxWidth: 44 });

  const active = card.status === "active" && card.expiresAt.getTime() > Date.now();
  page.drawRectangle({ x: 112, y: datesY, width: 43, height: 15, color: active ? rgb(0.92, 0.97, 0.94) : rgb(0.98, 0.93, 0.93), borderColor: active ? green : rgb(0.7, 0.2, 0.2), borderWidth: 0.45 });
  page.drawText(active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED", { x: 112, y: datesY + 5, size: 5, font: bold, color: active ? green : rgb(0.65, 0.12, 0.12), maxWidth: 43, alignment: "center" } as never);
  page.drawText("Official school identification · Not a national identity document", { x: 8, y: 6, size: 3.1, font: regular, color: muted, maxWidth: 145 });
}

export async function buildIdentityCardPdf(cards: CardRow[], school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown }, origin: string) {
  if (!cards.length) throw new AppError("No identity cards matched this selection.", 404, "NO_CARDS");
  if (cards.length > MAX_BULK_CARDS) throw new AppError(`A single print pack can contain at most ${MAX_BULK_CARDS} cards.`, 413, "TOO_MANY_CARDS");
  const pdf = await PDFDocument.create();
  const columns = 2;
  const rows = 4;
  const marginX = (A4_WIDTH - columns * CARD_WIDTH) / 2;
  const marginY = 42;
  const gapX = 8;
  const gapY = 8;
  for (let i = 0; i < cards.length; i += columns * rows) {
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawText(school.name, { x: marginX, y: A4_HEIGHT - 18, size: 7, font: await pdf.embedFont(StandardFonts.HelveticaBold), color: rgb(0.25, 0.29, 0.34), maxWidth: A4_WIDTH - marginX * 2 });
    const batch = cards.slice(i, i + columns * rows);
    for (let index = 0; index < batch.length; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = marginX + column * (CARD_WIDTH + gapX) - gapX / 2;
      const y = A4_HEIGHT - marginY - (row + 1) * CARD_HEIGHT - row * gapY;
      page.pushOperators();
      const cardPage = await pdf.addPage([CARD_WIDTH, CARD_HEIGHT]);
      await drawCard(cardPage, batch[index], school, origin);
      const embedded = await pdf.embedPage(cardPage);
      page.drawPage(embedded, { x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
      pdf.removePage(pdf.getPageCount() - 1);
    }
    page.drawText(`Identity card print pack · ${Math.min(i + batch.length, cards.length)} of ${cards.length}`, { x: marginX, y: 18, size: 5.5, font: await pdf.embedFont(StandardFonts.Helvetica), color: rgb(0.42, 0.46, 0.5) });
  }
  return Buffer.from(await pdf.save());
}

export async function reconcileAndListIdentityCards(schoolId: string, schoolCode: string) {
  return withTenant(schoolId, async (tx) => listIdentityCards(tx, schoolId, schoolCode));
}

export async function reissueIdentityCard(tx: TenantDb, input: { schoolId: string; actorId: string; cardId: string }) {
  await requirePermission(tx, input.actorId, "identity_cards:manage");
  const current = await tx.$queryRawUnsafe<Array<{ id: string; personType: IdentityCardKind; studentId: string | null; staffId: string | null; serial: string }>>(
    `SELECT "id","personType","studentId","staffId","serial" FROM "IdentityCard" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.cardId
  );
  const card = current[0];
  if (!card) throw new AppError("Identity card not found.", 404, "CARD_NOT_FOUND");

  const targetColumn = card.personType === "student" ? "studentId" : "staffId";
  const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "IdentityCard" WHERE "schoolId"=$1 AND "${targetColumn}"=$2 AND "status"='active' ORDER BY "createdAt" DESC LIMIT 1`,
    input.schoolId,
    card[targetColumn as "studentId" | "staffId"]
  );
  const activeId = active[0]?.id ?? card.id;
  const now = new Date();
  const school = await tx.$queryRawUnsafe<Array<{ uniqueCode: string }>>(`SELECT "uniqueCode" FROM "School" WHERE "id"=$1 LIMIT 1`, input.schoolId);
  if (!school[0]) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
  const serial = randomSerial(school[0].uniqueCode, card.personType);
  await tx.$executeRawUnsafe(`UPDATE "IdentityCard" SET "status"='revoked',"updatedAt"=$3,"version"="version"+1 WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, activeId, now);
  const newId = `ic_${randomBytes(12).toString("hex")}`;
  await tx.$executeRawUnsafe(
    `INSERT INTO "IdentityCard" ("id","schoolId","personType","studentId","staffId","serial","issuedAt","expiresAt","status","version","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',1,$7,$7)`,
    newId,
    input.schoolId,
    card.personType,
    card.studentId,
    card.staffId,
    serial,
    now,
    cardExpiry(now)
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "identity_card.reissued",
    entityType: "IdentityCard",
    entityId: newId,
    before: { revokedCardId: activeId, previousSerial: card.serial },
    after: { serial }
  });
  return { id: newId, serial };
}

export async function revokeIdentityCard(tx: TenantDb, input: { schoolId: string; actorId: string; cardId: string }) {
  await requirePermission(tx, input.actorId, "identity_cards:manage");
  const rows = await tx.$queryRawUnsafe<Array<{ status: string; version: number; serial: string }>>(`SELECT "status","version","serial" FROM "IdentityCard" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.cardId);
  if (!rows[0]) throw new AppError("Identity card not found.", 404, "CARD_NOT_FOUND");
  if (rows[0].status === "revoked") throw new AppError("This identity card is already revoked.", 409, "CARD_ALREADY_REVOKED");
  await tx.$executeRawUnsafe(`UPDATE "IdentityCard" SET "status"='revoked',"version"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.cardId, rows[0].version + 1);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "identity_card.revoked", entityType: "IdentityCard", entityId: input.cardId, before: rows[0], after: { status: "revoked", version: rows[0].version + 1, serial: rows[0].serial } });
  return { id: input.cardId, status: "revoked" };
}

export async function publicIdentityCardBySerial(
  schoolId: string,
  schoolCode: string,
  serial: string,
  signature: string
) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<CardRow[]>(
      `SELECT c."id",c."schoolId",c."personType",c."studentId",c."staffId",c."serial",c."issuedAt",c."expiresAt",c."status",c."version",
              COALESCE(s."name",u."name") AS "personName",s."admissionNo",cl."name" AS "className",NULL::text AS "roleName",s."photoUrl"
         FROM "IdentityCard" c
         LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
         LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
         LEFT JOIN "User" u ON u."id"=c."staffId" AND u."schoolId"=c."schoolId"
        WHERE c."schoolId"=$1 AND c."serial"=$2 LIMIT 1`, schoolId, serial
    );
    const card = rows[0];
    if (!card || !verifyIdentityCardSignature(card, signature)) return null;
    const personActive = card.personType === "student"
      ? Boolean((await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, card.studentId))[0]?.status === "active")
      : Boolean((await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "User" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, card.staffId))[0]?.status === "active");
    const expired = card.expiresAt.getTime() <= Date.now();
    return { card, school: { name: schoolCode }, state: card.status === "revoked" ? "revoked" : expired ? "expired" : !personActive ? "inactive" : "verified" } as const;
  });
}

export { DEFAULT_VALIDITY_MONTHS, MAX_BULK_CARDS };
