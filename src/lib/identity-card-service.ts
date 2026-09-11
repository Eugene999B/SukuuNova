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

export const DEFAULT_VALIDITY_MONTHS = 60;
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
  personNumber: string;
  admissionNo: string | null;
  classId: string | null;
  className: string | null;
  roleName: string | null;
  photoUrl: string | null;
  houseName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

export type IdentityCardKind = "student" | "staff";
export type IdentityCardScope = "all" | IdentityCardKind | "class" | "selected";
export type IdentityCardView = CardRow & { isExpired: boolean; photoReady: boolean };
export type IdentityCardSettings = { validityMonths: number };

type SchoolCardBrand = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  brandColors: unknown;
};

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

function normalizeValidityMonths(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) return DEFAULT_VALIDITY_MONTHS;
  return parsed;
}

function expiry(from: Date, validityMonths: number) {
  const value = new Date(from);
  value.setUTCMonth(value.getUTCMonth() + normalizeValidityMonths(validityMonths));
  return value;
}

export async function getIdentityCardSettings(tx: TenantDb, schoolId: string): Promise<IdentityCardSettings> {
  const rows = await tx.$queryRawUnsafe<Array<{ validityMonths: number }>>(
    `SELECT "validityMonths" FROM "IdentityCardSetting" WHERE "schoolId"=$1 LIMIT 1`,
    schoolId,
  );
  if (rows[0]) return { validityMonths: normalizeValidityMonths(rows[0].validityMonths) };
  await tx.$executeRawUnsafe(
    `INSERT INTO "IdentityCardSetting" ("schoolId","validityMonths","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO NOTHING`,
    schoolId,
    DEFAULT_VALIDITY_MONTHS,
  );
  return { validityMonths: DEFAULT_VALIDITY_MONTHS };
}

export async function updateIdentityCardSettings(tx: TenantDb, input: { schoolId: string; actorId: string; validityMonths: number }) {
  await requirePermission(tx, input.actorId, "identity_cards:manage");
  const validityMonths = normalizeValidityMonths(input.validityMonths);
  if (validityMonths !== input.validityMonths) throw new AppError("Identity card validity must be between 1 and 120 months.", 400, "INVALID_CARD_VALIDITY");
  const before = await getIdentityCardSettings(tx, input.schoolId);
  await tx.$executeRawUnsafe(
    `INSERT INTO "IdentityCardSetting" ("schoolId","validityMonths","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)
     ON CONFLICT ("schoolId") DO UPDATE SET "validityMonths"=EXCLUDED."validityMonths","updatedAt"=CURRENT_TIMESTAMP`,
    input.schoolId,
    validityMonths,
  );
  const updatedCards = await tx.$executeRawUnsafe(
    `UPDATE "IdentityCard"
     SET "expiresAt"="issuedAt" + make_interval(months => $2::int),
         "version"="version"+1,
         "updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "status"='active'`,
    input.schoolId,
    validityMonths,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "identity_cards.validity_updated",
    entityType: "IdentityCardSetting",
    entityId: input.schoolId,
    before,
    after: { validityMonths, updatedCards },
  });
  return { validityMonths, updatedCards };
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

async function insertCard(tx: TenantDb, schoolId: string, schoolCode: string, kind: IdentityCardKind, personId: string, now: Date, validityMonths?: number) {
  const id = `ic_${randomBytes(12).toString("hex")}`;
  const value = await allocateSerial(tx, schoolId, schoolCode, kind);
  const months = validityMonths ?? (await getIdentityCardSettings(tx, schoolId)).validityMonths;
  const expiresAt = expiry(now, months);
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
  const [students, staff, existing, settings] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Student" WHERE "schoolId"=$1 AND "status"='active'`, schoolId),
    staffPeople(tx, schoolId),
    tx.$queryRawUnsafe<Array<{ id: string; personType: IdentityCardKind; studentId: string | null; staffId: string | null }>>(
      `SELECT "id","personType","studentId","staffId" FROM "IdentityCard" WHERE "schoolId"=$1 AND "status"='active'`, schoolId,
    ),
    getIdentityCardSettings(tx, schoolId),
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
  for (const student of students) if (!studentCardSet.has(student.id)) { await insertCard(tx, schoolId, schoolCode, "student", student.id, now, settings.validityMonths); created += 1; }
  for (const staffMember of staff) if (!staffCardSet.has(staffMember.id)) { await insertCard(tx, schoolId, schoolCode, "staff", staffMember.id, now, settings.validityMonths); created += 1; }
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
            COALESCE(s."name",u."name") AS "personName",
            CASE WHEN c."personType"='student' THEN COALESCE(s."admissionNo",c."serial")
                 ELSE 'STF-' || UPPER(RIGHT(REPLACE(COALESCE(u."id",c."staffId",c."serial"),'-',''),8)) END AS "personNumber",
            s."admissionNo",s."classId",cl."name" AS "className",h."name" AS "houseName",
            CASE WHEN c."personType"='staff' THEN (
              SELECT r."name" FROM "UserRole" ur
              JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
              WHERE ur."schoolId"=c."schoolId" AND ur."userId"=u."id"
              ORDER BY CASE WHEN r."name"='Owner' THEN 0 ELSE 1 END,r."name" LIMIT 1
            ) ELSE NULL END AS "roleName",
            COALESCE(s."photoUrl",u."photoUrl") AS "photoUrl",
            u."phone" AS "contactPhone",u."email" AS "contactEmail",
            CASE WHEN c."personType"='student' THEN (
              SELECT g."name" FROM "StudentGuardian" sg JOIN "Guardian" g ON g."id"=sg."guardianId" AND g."schoolId"=sg."schoolId"
              WHERE sg."schoolId"=c."schoolId" AND sg."studentId"=s."id"
              ORDER BY sg."isPrimary" DESC,g."name" LIMIT 1
            ) ELSE NULL END AS "guardianName",
            CASE WHEN c."personType"='student' THEN (
              SELECT g."phone" FROM "StudentGuardian" sg JOIN "Guardian" g ON g."id"=sg."guardianId" AND g."schoolId"=sg."schoolId"
              WHERE sg."schoolId"=c."schoolId" AND sg."studentId"=s."id" AND g."phone" IS NOT NULL
              ORDER BY sg."isPrimary" DESC,g."name" LIMIT 1
            ) ELSE NULL END AS "guardianPhone"
     FROM "IdentityCard" c
     LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
     LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
     LEFT JOIN "House" h ON h."id"=s."houseId" AND h."schoolId"=c."schoolId"
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
    primary: hexColor(typeof row.primary === "string" ? row.primary : typeof row.primaryColor === "string" ? row.primaryColor : undefined, [.035, .13, .22]),
    accent: hexColor(typeof row.accent === "string" ? row.accent : typeof row.secondary === "string" ? row.secondary : undefined, [.88, .67, .14]),
  };
}

function fitText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, minimum = 4.25) {
  const value = String(text || "-");
  let fontSize = size;
  while (fontSize > minimum && font.widthOfTextAtSize(value, fontSize) > width) fontSize -= .25;
  page.drawText(value, { x, y, size: fontSize, font, color, maxWidth: width });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "SN";
}

function formatCardDate(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
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
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: rgb(.82, .86, .9), borderWidth: .5 });
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        page.drawRectangle({ x: x + (column + quiet) * unit, y: y + (count - row - 1 + quiet) * unit, width: unit + .08, height: unit + .08, color: dark });
      }
    }
  }
}

function drawSecurityPattern(page: PDFPage, primary: ReturnType<typeof rgb>, accent: ReturnType<typeof rgb>) {
  for (let index = 0; index < 11; index += 1) {
    const offset = index * 22;
    page.drawLine({ start: { x: -20 + offset, y: 0 }, end: { x: 55 + offset, y: CARD_HEIGHT }, thickness: .35, color: index % 2 ? primary : accent, opacity: .055 });
  }
  for (let index = 0; index < 6; index += 1) {
    page.drawCircle({ x: CARD_WIDTH - 20, y: 48, size: 13 + index * 6, borderColor: index % 2 ? primary : accent, borderWidth: .35, opacity: .055 });
  }
}

async function drawHeaderMark(doc: PDFDocument, page: PDFPage, school: { name: string; logoUrl: string | null }, x: number, y: number, size: number, accent: ReturnType<typeof rgb>, primary: ReturnType<typeof rgb>) {
  const logo = photoData(school.logoUrl);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: accent, borderWidth: .8 });
  if (logo) {
    try {
      const image = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const scale = Math.min((size - 4) / image.width, (size - 4) / image.height);
      page.drawImage(image, { x: x + (size - image.width * scale) / 2, y: y + (size - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      return;
    } catch { /* fall back to initials */ }
  }
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  fitText(page, bold, initials(school.name), x + 3, y + size * .39, size - 6, size * .23, primary, 4);
}

async function drawPortrait(doc: PDFDocument, page: PDFPage, card: CardRow, x: number, y: number, width: number, height: number, accent: ReturnType<typeof rgb>, primary: ReturnType<typeof rgb>, light: ReturnType<typeof rgb>) {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x, y, width, height, color: light, borderColor: accent, borderWidth: 1.3 });
  const photo = photoData(card.photoUrl);
  if (photo) {
    try {
      const image = photo.mime.includes("png") ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
      const scale = Math.min((width - 3) / image.width, (height - 3) / image.height);
      const imageWidth = image.width * scale, imageHeight = image.height * scale;
      page.drawImage(image, { x: x + (width - imageWidth) / 2, y: y + (height - imageHeight) / 2, width: imageWidth, height: imageHeight });
      return;
    } catch { /* use initials */ }
  }
  const mark = initials(card.personName);
  const markWidth = bold.widthOfTextAtSize(mark, 20);
  page.drawText(mark, { x: x + width / 2 - markWidth / 2, y: y + height / 2 - 7, size: 20, font: bold, color: primary });
}

function drawField(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, x: number, y: number, width: number, primary: ReturnType<typeof rgb>, muted: ReturnType<typeof rgb>, size = 7) {
  page.drawText(label.toUpperCase(), { x, y: y + 8, size: 3.7, font: bold, color: muted, maxWidth: width });
  fitText(page, regular, value || "-", x, y, width, size, primary, 4.5);
}

async function drawFrontCard(doc: PDFDocument, page: PDFPage, card: CardRow, school: SchoolCardBrand, x: number, y: number) {
  const { primary, accent } = palette(school.brandColors);
  const white = rgb(1, 1, 1), muted = rgb(.36, .42, .48), border = rgb(.82, .86, .9), light = rgb(.965, .975, .985), dark = rgb(.045, .10, .16), green = rgb(.08, .45, .24), red = rgb(.67, .12, .12);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  page.pushOperators(pushGraphicsState(), translate(x, y));
  page.drawRectangle({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, color: white, borderColor: primary, borderWidth: .8 });
  drawSecurityPattern(page, primary, accent);
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 39, width: CARD_WIDTH, height: 39, color: primary });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 43, width: CARD_WIDTH, height: 4, color: accent });
  await drawHeaderMark(doc, page, school, 8, CARD_HEIGHT - 34, 25, accent, primary);
  fitText(page, bold, school.name.toUpperCase(), 40, CARD_HEIGHT - 17, CARD_WIDTH - 50, 10.5, white, 7.2);
  page.drawText(card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD", { x: 40, y: CARD_HEIGHT - 29, size: 4.6, font: bold, color: accent, maxWidth: CARD_WIDTH - 50, characterSpacing: .35 });

  await drawPortrait(doc, page, card, 9, 31, 60, 72, accent, primary, light);
  const infoX = 78;
  fitText(page, bold, card.personName, infoX, 93, CARD_WIDTH - infoX - 10, 11.2, dark, 7.1);
  page.drawRectangle({ x: infoX, y: 87, width: 67, height: 1.2, color: accent });
  drawField(page, bold, regular, card.personType === "student" ? "Student ID" : "Staff ID", card.personNumber, infoX, 70, 150, primary, muted, 8.5);
  drawField(page, bold, regular, card.personType === "student" ? "Class" : "Role / Position", card.personType === "student" ? (card.className || "Not assigned") : (card.roleName || "Staff member"), infoX, 51, 150, primary, muted, 7.2);
  page.drawText("CARD NO.", { x: infoX, y: 39.5, size: 3.5, font: bold, color: muted });
  fitText(page, regular, card.serial, infoX, 32, 150, 5.2, dark, 3.8);

  page.drawRectangle({ x: 9, y: 8, width: 111, height: 18, color: light, borderColor: border, borderWidth: .45 });
  page.drawText("ISSUED", { x: 14, y: 19, size: 3.3, font: bold, color: muted });
  page.drawText(formatCardDate(card.issuedAt), { x: 14, y: 12, size: 5.2, font: bold, color: primary });
  page.drawText("VALID UNTIL", { x: 67, y: 19, size: 3.3, font: bold, color: muted });
  page.drawText(formatCardDate(card.expiresAt), { x: 67, y: 12, size: 5.2, font: bold, color: primary });
  const active = card.status === "active" && card.expiresAt.getTime() > Date.now();
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  page.drawRectangle({ x: 128, y: 9, width: 48, height: 16, color: active ? rgb(.92, .97, .94) : rgb(.98, .93, .93), borderColor: active ? rgb(.62, .83, .67) : rgb(.84, .55, .55), borderWidth: .45 });
  const statusWidth = bold.widthOfTextAtSize(status, 5.1);
  page.drawText(status, { x: 152 - statusWidth / 2, y: 14.5, size: 5.1, font: bold, color: active ? green : red });
  page.drawText("OFFICIAL SCHOOL CREDENTIAL", { x: 183, y: 17.8, size: 3.1, font: bold, color: muted, maxWidth: 51 });
  page.drawText("FRONT", { x: 183, y: 11, size: 4.7, font: bold, color: primary, maxWidth: 51 });
  page.pushOperators(popGraphicsState());
}

async function drawBackCard(doc: PDFDocument, page: PDFPage, card: CardRow, school: SchoolCardBrand, origin: string, x: number, y: number) {
  const { primary, accent } = palette(school.brandColors);
  const white = rgb(1, 1, 1), muted = rgb(.36, .42, .48), border = rgb(.82, .86, .9), light = rgb(.965, .975, .985), dark = rgb(.045, .10, .16);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  page.pushOperators(pushGraphicsState(), translate(x, y));
  page.drawRectangle({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, color: white, borderColor: primary, borderWidth: .8 });
  drawSecurityPattern(page, primary, accent);
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 33, width: CARD_WIDTH, height: 33, color: primary });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 37, width: CARD_WIDTH, height: 4, color: accent });
  await drawHeaderMark(doc, page, school, 9, CARD_HEIGHT - 29, 21, accent, primary);
  fitText(page, bold, school.name.toUpperCase(), 37, CARD_HEIGHT - 15, 144, 8.4, white, 6.3);
  page.drawText("SECURE ID · SCAN TO VERIFY", { x: 37, y: CARD_HEIGHT - 26, size: 4.1, font: bold, color: accent, maxWidth: 144, characterSpacing: .25 });
  page.drawText(initials(school.name), { x: 142, y: 49, size: 42, font: bold, color: primary, opacity: .045 });

  const leftX = 11;
  drawField(page, bold, regular, card.personType === "student" ? "Student ID" : "Staff ID", card.personNumber, leftX, 92, 145, primary, muted, 8.4);
  drawField(page, bold, regular, card.personType === "student" ? "Class / House" : "Role", card.personType === "student" ? [card.className, card.houseName].filter(Boolean).join(" · ") || "Not assigned" : (card.roleName || "Staff member"), leftX, 73, 145, primary, muted, 6.8);
  if (card.personType === "student") {
    drawField(page, bold, regular, "Guardian / Emergency", card.guardianName || "School office", leftX, 54, 145, primary, muted, 6.4);
    drawField(page, bold, regular, "Emergency contact", card.guardianPhone || "Contact the school office", leftX, 36, 145, primary, muted, 6.4);
  } else {
    drawField(page, bold, regular, "Phone", card.contactPhone || "Contact the school office", leftX, 54, 145, primary, muted, 6.4);
    drawField(page, bold, regular, "Email", card.contactEmail || "School staff account", leftX, 36, 145, primary, muted, 5.7);
  }

  const qrSize = 57;
  drawQr(page, qrMatrix(identityCardVerificationUrl(origin, school.uniqueCode, card)), CARD_WIDTH - qrSize - 10, 47, qrSize, primary);
  page.drawText("SCAN TO VERIFY", { x: CARD_WIDTH - qrSize - 10, y: 39, size: 4, font: bold, color: primary, maxWidth: qrSize, characterSpacing: .25 });
  page.drawText("Live status · expiry · authenticity", { x: CARD_WIDTH - qrSize - 10, y: 32.8, size: 3, font: regular, color: muted, maxWidth: qrSize });

  page.drawLine({ start: { x: 11, y: 25 }, end: { x: 88, y: 25 }, thickness: .55, color: border });
  page.drawText("AUTHORISED SIGNATURE", { x: 11, y: 18, size: 3.1, font: bold, color: muted });
  page.drawText(`School code: ${school.uniqueCode}`, { x: 96, y: 19, size: 3.8, font: bold, color: primary, maxWidth: 75 });
  page.drawRectangle({ x: 8, y: 5, width: CARD_WIDTH - 16, height: 10, color: light, borderColor: border, borderWidth: .35 });
  fitText(page, regular, `If found, please return this card to ${school.name}. Not a national identity document.`, 12, 8.1, CARD_WIDTH - 24, 3.4, dark, 3);
  page.pushOperators(popGraphicsState());
}

export async function buildSingleIdentityCardPdf(card: CardRow, school: SchoolCardBrand, origin: string) {
  const doc = await PDFDocument.create();
  const front = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  await drawFrontCard(doc, front, card, school, 0, 0);
  const back = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  await drawBackCard(doc, back, card, school, origin, 0, 0);
  doc.setTitle(`${school.name} - ${card.personName} ID card`);
  doc.setSubject("Two-sided CR80 school identity card");
  return Buffer.from(await doc.save());
}

function drawSheetHeader(page: PDFPage, bold: PDFFont, schoolName: string, label: string, note: string) {
  page.drawText(schoolName, { x: 48, y: A4_HEIGHT - 22, size: 8, font: bold, color: rgb(.12, .16, .22), maxWidth: A4_WIDTH - 96 });
  page.drawText(label, { x: 48, y: A4_HEIGHT - 34, size: 6, font: bold, color: rgb(.38, .43, .5), maxWidth: A4_WIDTH - 96 });
  page.drawText(note, { x: 48, y: 20, size: 5.2, font: bold, color: rgb(.46, .5, .56), maxWidth: A4_WIDTH - 96 });
}

export async function buildIdentityCardPdf(cards: CardRow[], school: SchoolCardBrand, origin: string) {
  if (!cards.length) throw new AppError("No current identity cards matched this selection.", 404, "NO_CARDS");
  if (cards.length > MAX_BULK_CARDS) throw new AppError(`A single print pack can contain at most ${MAX_BULK_CARDS} cards.`, 413, "TOO_MANY_CARDS");
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gapX = 8, gapY = 8, gridWidth = 2 * CARD_WIDTH + gapX, marginX = (A4_WIDTH - gridWidth) / 2;
  const topY = A4_HEIGHT - 48 - CARD_HEIGHT;
  for (let i = 0; i < cards.length; i += 8) {
    const batch = cards.slice(i, i + 8);
    const sheet = Math.floor(i / 8) + 1;
    const frontPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawSheetHeader(frontPage, bold, school.name, `ID CARD FRONT SHEET ${sheet}`, "Print at Actual Size / 100%. Duplex printing: flip on the long edge.");
    for (let j = 0; j < batch.length; j += 1) {
      const column = j % 2, row = Math.floor(j / 2);
      await drawFrontCard(doc, frontPage, batch[j], school, marginX + column * (CARD_WIDTH + gapX), topY - row * (CARD_HEIGHT + gapY));
    }
    const backPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawSheetHeader(backPage, bold, school.name, `ID CARD BACK SHEET ${sheet}`, "Backs are mirrored for duplex alignment. Print at Actual Size / 100%; flip on the long edge.");
    for (let j = 0; j < batch.length; j += 1) {
      const column = j % 2, row = Math.floor(j / 2);
      const mirroredColumn = 1 - column;
      await drawBackCard(doc, backPage, batch[j], school, origin, marginX + mirroredColumn * (CARD_WIDTH + gapX), topY - row * (CARD_HEIGHT + gapY));
    }
  }
  doc.setTitle(`${school.name} duplex identity card print pack`);
  doc.setSubject("Front and back CR80 student and staff identity cards arranged for A4 duplex printing");
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
  const settings = await getIdentityCardSettings(tx, input.schoolId);
  const created = await insertCard(tx, input.schoolId, school.uniqueCode, card.personType, personId, now, settings.validityMonths);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "identity_card.reissued", entityType: "IdentityCard", entityId: created.id, before: { revokedCardId: activeId, previousSerial: card.serial }, after: { serial: created.serial, validityMonths: settings.validityMonths } });
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
              COALESCE(s."name",u."name") AS "personName",
              CASE WHEN c."personType"='student' THEN COALESCE(s."admissionNo",c."serial")
                   ELSE 'STF-' || UPPER(RIGHT(REPLACE(COALESCE(u."id",c."staffId",c."serial"),'-',''),8)) END AS "personNumber",
              s."admissionNo",s."classId",cl."name" AS "className",h."name" AS "houseName",
              CASE WHEN c."personType"='staff' THEN (
                SELECT r."name" FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
                WHERE ur."schoolId"=c."schoolId" AND ur."userId"=u."id" ORDER BY r."name" LIMIT 1
              ) ELSE NULL END AS "roleName",
              COALESCE(s."photoUrl",u."photoUrl") AS "photoUrl",
              NULL::text AS "guardianName",NULL::text AS "guardianPhone",NULL::text AS "contactPhone",NULL::text AS "contactEmail"
       FROM "IdentityCard" c
       LEFT JOIN "Student" s ON s."id"=c."studentId" AND s."schoolId"=c."schoolId"
       LEFT JOIN "Class" cl ON cl."id"=s."classId" AND cl."schoolId"=c."schoolId"
       LEFT JOIN "House" h ON h."id"=s."houseId" AND h."schoolId"=c."schoolId"
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
