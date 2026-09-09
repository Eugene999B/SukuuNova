import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { getGuardianFamilyContext } from "./guardian-family-context";
import { hasPermission, requirePermission } from "./rbac";
import { safeResourceUrl } from "./resource-url";

type Row = Record<string, unknown>;
export type GuardianLibraryContext = { schoolId: string; guardianId: string; userId: string };
export type LibraryContentActor =
  | { kind: "guardian"; schoolId: string; guardianId: string; userId: string; studentId: string }
  | { kind: "school"; schoolId: string; userId: string };

function stringValue(value: unknown, field: string, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AppError(`${field} is required.`, 400, "INVALID_INPUT");
  return value.trim();
}
function optionalString(value: unknown, max = 3000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AppError("Invalid text value.", 400, "INVALID_INPUT");
  return value.trim() || null;
}
function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  throw new AppError("Invalid yes/no value.", 400, "INVALID_INPUT");
}
function boundedInt(value: unknown, field: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new AppError(`${field} is invalid.`, 400, "INVALID_INPUT");
  return number;
}
function jsonObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function jsonList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map(entry => entry.trim()).slice(0, 100) : [];
}
function audienceAllows(audienceValue: unknown, child: { id: string; classId: string | null; classLevel: string | null }) {
  const audience = jsonObject(audienceValue);
  const studentIds = jsonList(audience.studentIds);
  const classIds = jsonList(audience.classIds);
  const classLevels = jsonList(audience.classLevels);
  const targeted = studentIds.length > 0 || classIds.length > 0 || classLevels.length > 0;
  if (!targeted) return true;
  return studentIds.includes(child.id)
    || Boolean(child.classId && classIds.includes(child.classId))
    || Boolean(child.classLevel && classLevels.some(level => level.toLowerCase() === child.classLevel?.toLowerCase()));
}

async function guardianChild(tx: TenantDb, context: GuardianLibraryContext, studentId?: string | null) {
  const family = await getGuardianFamilyContext(tx, {
    schoolId: context.schoolId,
    guardianId: context.guardianId,
    userId: context.userId,
    studentId: studentId ?? null,
  });
  const selected = family.selectedChild
    ?? family.children.find(child => child.isPrimary && child.status === "active")
    ?? family.children.find(child => child.status === "active")
    ?? family.children[0]
    ?? null;
  return { family, selected };
}

async function matchingAssignments(tx: TenantDb, schoolId: string, child: { id: string; classId: string | null }) {
  return tx.$queryRawUnsafe<Row[]>(
    `SELECT a.*,b."title" AS "bookTitle" FROM "P3LibraryResourceAssignment" a JOIN "P3LibraryBook" b ON b."id"=a."bookId" AND b."schoolId"=a."schoolId" WHERE a."schoolId"=$1 AND (a."studentId"=$2 OR (a."studentId" IS NULL AND a."classId"=$3) OR (a."studentId" IS NULL AND a."classId" IS NULL)) ORDER BY CASE a."kind" WHEN 'required' THEN 0 WHEN 'recommended' THEN 1 ELSE 2 END,a."createdAt" DESC LIMIT 200`,
    schoolId, child.id, child.classId,
  );
}

export async function guardianLibraryOverview(tx: TenantDb, context: GuardianLibraryContext, studentId?: string | null) {
  const { family, selected } = await guardianChild(tx, context, studentId);
  if (!selected) return { children: family.children, selected: null, books: [], progress: [], bookmarks: [], favourites: [], reservations: [], loans: [], assignments: [] };
  if (selected.status !== "active") throw new AppError("Library access is available only for an active linked learner.", 409, "LEARNER_INACTIVE");

  const [catalogue, assignments, progress, bookmarks, favourites, reservations, loans] = await Promise.all([
    tx.$queryRawUnsafe<Row[]>(`SELECT "id","isbn","title","author","category","copies","availableCopies","materialType","coverUrl","description","publisher","publishedYear","language","tags","accessibility","readerEnabled","downloadAllowed","visibility","audience","rightsNote","estimatedMinutes","createdAt","updatedAt",("fileUrl" IS NOT NULL) AS "digitalSourceConfigured" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "archivedAt" IS NULL AND "visibility" IN ('school','restricted') ORDER BY "title"`, context.schoolId),
    matchingAssignments(tx, context.schoolId, selected),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3LibraryReadingProgress" WHERE "schoolId"=$1 AND "studentId"=$2 ORDER BY "lastOpenedAt" DESC LIMIT 300`, context.schoolId, selected.id),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3LibraryBookmark" WHERE "schoolId"=$1 AND "studentId"=$2 ORDER BY "createdAt" DESC LIMIT 500`, context.schoolId, selected.id),
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3LibraryFavourite" WHERE "schoolId"=$1 AND "studentId"=$2 ORDER BY "createdAt" DESC LIMIT 500`, context.schoolId, selected.id),
    tx.$queryRawUnsafe<Row[]>(`SELECT r.*,b."title" AS "bookTitle" FROM "P3LibraryReservation" r JOIN "P3LibraryBook" b ON b."id"=r."bookId" AND b."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."studentId"=$2 AND r."status" IN ('waiting','ready') ORDER BY r."requestedAt" DESC`, context.schoolId, selected.id),
    tx.$queryRawUnsafe<Row[]>(`SELECT l.*,b."title" AS "bookTitle",CASE WHEN l."status"='borrowed' AND l."dueAt"<CURRENT_TIMESTAMP THEN 'overdue' ELSE l."status" END AS "displayStatus" FROM "P3LibraryLoan" l JOIN "P3LibraryBook" b ON b."id"=l."bookId" AND b."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND l."studentId"=$2 ORDER BY l."borrowedAt" DESC LIMIT 300`, context.schoolId, selected.id),
  ]);

  const assignmentIds = new Set(assignments.map(row => String(row.bookId)));
  const books = catalogue.filter(book => {
    if (book.visibility === "restricted" && !assignmentIds.has(String(book.id))) return false;
    return audienceAllows(book.audience, selected);
  }).map(book => ({
    ...book,
    coverUrl: safeResourceUrl(book.coverUrl),
    digitalAvailable: Boolean(book.digitalSourceConfigured && book.readerEnabled),
    downloadAllowed: Boolean(book.downloadAllowed && book.readerEnabled && book.digitalSourceConfigured),
  }));

  return {
    children: family.children,
    selected,
    books,
    progress,
    bookmarks,
    favourites,
    reservations,
    loans,
    assignments: assignments.filter(row => books.some(book => book.id === row.bookId)),
  };
}

async function requireGuardianBook(tx: TenantDb, context: GuardianLibraryContext, studentId: string, bookId: string) {
  const overview = await guardianLibraryOverview(tx, context, studentId);
  if (!overview.selected || overview.selected.id !== studentId) throw new AppError("Learner is not linked to this guardian account.", 403, "FORBIDDEN");
  const book = overview.books.find(row => row.id === bookId);
  if (!book) throw new AppError("This library resource is not available to the selected learner.", 404, "RESOURCE_NOT_FOUND");
  return { selected: overview.selected, book };
}

export async function guardianLibraryAction(tx: TenantDb, context: GuardianLibraryContext, body: Row) {
  const action = stringValue(body.action, "action", 80);
  const studentId = stringValue(body.studentId, "studentId", 120);
  const bookId = stringValue(body.bookId, "bookId", 120);
  await requireGuardianBook(tx, context, studentId, bookId);

  if (action === "progress") {
    const progress = Number(body.progressPercent ?? 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new AppError("Reading progress must be between 0 and 100.", 400, "INVALID_PROGRESS");
    const lastPage = body.lastPage === undefined || body.lastPage === null || body.lastPage === "" ? null : boundedInt(body.lastPage, "lastPage", 0, 1000000);
    const totalPages = body.totalPages === undefined || body.totalPages === null || body.totalPages === "" ? null : boundedInt(body.totalPages, "totalPages", 1, 1000000);
    const lastPosition = optionalString(body.lastPosition, 1000);
    const id = createId();
    const rows = await tx.$queryRawUnsafe<Row[]>(`INSERT INTO "P3LibraryReadingProgress" ("id","schoolId","bookId","studentId","progressPercent","lastPage","totalPages","lastPosition","lastOpenedAt","completedAt","updatedBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CASE WHEN $5::numeric>=100 THEN CURRENT_TIMESTAMP ELSE NULL END,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId","bookId","studentId") DO UPDATE SET "progressPercent"=EXCLUDED."progressPercent","lastPage"=EXCLUDED."lastPage","totalPages"=EXCLUDED."totalPages","lastPosition"=EXCLUDED."lastPosition","lastOpenedAt"=CURRENT_TIMESTAMP,"completedAt"=CASE WHEN EXCLUDED."progressPercent">=100 THEN COALESCE("P3LibraryReadingProgress"."completedAt",CURRENT_TIMESTAMP) ELSE NULL END,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=CURRENT_TIMESTAMP RETURNING *`, id, context.schoolId, bookId, studentId, progress, lastPage, totalPages, lastPosition, context.userId);
    return { progress: rows[0] };
  }

  if (action === "bookmark") {
    const position = stringValue(body.position, "position", 1000);
    const id = createId();
    await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryBookmark" ("id","schoolId","bookId","studentId","position","label","note","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`, id, context.schoolId, bookId, studentId, position, optionalString(body.label, 300), optionalString(body.note, 2000), context.userId);
    await appendSchoolAudit(tx, { schoolId: context.schoolId, actorId: context.userId, action: "library.bookmark_created", entityType: "P3LibraryBookmark", entityId: id, after: { bookId, studentId } });
    return { id };
  }

  if (action === "removeBookmark") {
    const bookmarkId = stringValue(body.bookmarkId, "bookmarkId", 120);
    await tx.$queryRawUnsafe(`DELETE FROM "P3LibraryBookmark" WHERE "schoolId"=$1 AND "id"=$2 AND "studentId"=$3 AND "bookId"=$4`, context.schoolId, bookmarkId, studentId, bookId);
    return { id: bookmarkId };
  }

  if (action === "favourite") {
    const enabled = booleanValue(body.enabled, true);
    if (enabled) {
      const id = createId();
      await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryFavourite" ("id","schoolId","bookId","studentId","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId","bookId","studentId") DO NOTHING`, id, context.schoolId, bookId, studentId, context.userId);
    } else {
      await tx.$queryRawUnsafe(`DELETE FROM "P3LibraryFavourite" WHERE "schoolId"=$1 AND "bookId"=$2 AND "studentId"=$3`, context.schoolId, bookId, studentId);
    }
    return { enabled };
  }

  if (action === "reserve") {
    const book = await tx.$queryRawUnsafe<Array<{ availableCopies: number }>>(`SELECT "availableCopies" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2`, context.schoolId, bookId);
    if (!book[0]) throw new AppError("Resource not found.", 404, "RESOURCE_NOT_FOUND");
    const id = createId();
    const inserted = await tx.$queryRawUnsafe<Row[]>(`INSERT INTO "P3LibraryReservation" ("id","schoolId","bookId","studentId","status","createdBy","requestedAt") VALUES ($1,$2,$3,$4,'waiting',$5,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId","bookId","studentId") WHERE "status" IN ('waiting','ready') DO NOTHING RETURNING *`, id, context.schoolId, bookId, studentId, context.userId);
    if (!inserted[0]) {
      const existing = await tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3LibraryReservation" WHERE "schoolId"=$1 AND "bookId"=$2 AND "studentId"=$3 AND "status" IN ('waiting','ready') LIMIT 1`, context.schoolId, bookId, studentId);
      return { reservation: existing[0], alreadyReserved: true };
    }
    await appendSchoolAudit(tx, { schoolId: context.schoolId, actorId: context.userId, action: "library.reservation_created", entityType: "P3LibraryReservation", entityId: id, after: { bookId, studentId, availableCopies: Number(book[0].availableCopies) } });
    return { reservation: inserted[0] };
  }

  if (action === "cancelReservation") {
    const reservationId = stringValue(body.reservationId, "reservationId", 120);
    const cancelled = await tx.$queryRawUnsafe<Row[]>(`UPDATE "P3LibraryReservation" SET "status"='cancelled',"cancelledAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "studentId"=$3 AND "bookId"=$4 AND "status" IN ('waiting','ready') RETURNING *`, context.schoolId, reservationId, studentId, bookId);
    if (!cancelled[0]) throw new AppError("Open reservation not found.", 404, "RESERVATION_NOT_FOUND");
    return { reservation: cancelled[0] };
  }

  throw new AppError("Unknown library action.", 400, "UNKNOWN_ACTION");
}

export async function schoolLibraryResourceAction(tx: TenantDb, schoolId: string, userId: string, body: Row) {
  const action = stringValue(body.action, "action", 80);
  await requirePermission(tx, userId, "library:manage");

  if (action === "updateAccessPolicy") {
    const bookId = stringValue(body.bookId, "bookId", 120);
    const readerEnabled = booleanValue(body.readerEnabled, true);
    const downloadAllowed = booleanValue(body.downloadAllowed, false);
    if (downloadAllowed && !readerEnabled) throw new AppError("Downloads can be enabled only when protected reader access is enabled.", 400, "INVALID_ACCESS_POLICY");
    const visibility = stringValue(body.visibility ?? "school", "visibility", 30);
    if (!["school", "staff", "restricted"].includes(visibility)) throw new AppError("Choose a valid resource visibility.", 400, "INVALID_VISIBILITY");
    const estimatedMinutes = body.estimatedMinutes === undefined || body.estimatedMinutes === null || body.estimatedMinutes === "" ? null : boundedInt(body.estimatedMinutes, "estimatedMinutes", 1, 100000);
    const audience = body.audience && typeof body.audience === "object" && !Array.isArray(body.audience) ? body.audience : {};
    const updated = await tx.$queryRawUnsafe<Row[]>(`UPDATE "P3LibraryBook" SET "readerEnabled"=$3,"downloadAllowed"=$4,"visibility"=$5,"audience"=$6::jsonb,"rightsNote"=$7,"estimatedMinutes"=$8,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 RETURNING "id","title","readerEnabled","downloadAllowed","visibility","audience","rightsNote","estimatedMinutes"`, schoolId, bookId, readerEnabled, downloadAllowed, visibility, JSON.stringify(audience), optionalString(body.rightsNote, 3000), estimatedMinutes);
    if (!updated[0]) throw new AppError("Library resource not found.", 404, "RESOURCE_NOT_FOUND");
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.access_policy_updated", entityType: "P3LibraryBook", entityId: bookId, after: updated[0] });
    return { book: updated[0] };
  }

  if (action === "addCopy") {
    const bookId = stringValue(body.bookId, "bookId", 120);
    const accessionNo = stringValue(body.accessionNo, "accessionNo", 120);
    const condition = stringValue(body.condition ?? "good", "condition", 30);
    const status = stringValue(body.status ?? "available", "status", 30);
    if (!["new","good","fair","damaged","lost","withdrawn"].includes(condition)) throw new AppError("Invalid copy condition.", 400, "INVALID_COPY_CONDITION");
    if (!["available","repair","lost","withdrawn"].includes(status)) throw new AppError("New copies must start as available, repair, lost or withdrawn.", 400, "INVALID_COPY_STATUS");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${schoolId}:${bookId}`}))`;
    const book = await tx.$queryRawUnsafe<Row[]>(`SELECT "id" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, schoolId, bookId);
    if (!book[0]) throw new AppError("Library resource not found.", 404, "RESOURCE_NOT_FOUND");
    const id = createId();
    await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryCopy" ("id","schoolId","bookId","accessionNo","barcode","shelfLocation","condition","status","acquiredAt","notes","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, schoolId, bookId, accessionNo, optionalString(body.barcode, 120), optionalString(body.shelfLocation, 300), condition, status, body.acquiredAt ? stringValue(body.acquiredAt, "acquiredAt", 100) : null, optionalString(body.notes, 2000));
    await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "copies"="copies"+1,"availableCopies"="availableCopies"+$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, schoolId, bookId, status === "available" ? 1 : 0);
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.copy_added", entityType: "P3LibraryCopy", entityId: id, after: { bookId, accessionNo, barcode: optionalString(body.barcode, 120), status, condition } });
    return { id };
  }

  if (action === "assignResource") {
    const bookId = stringValue(body.bookId, "bookId", 120);
    const kind = stringValue(body.kind ?? "recommended", "kind", 30);
    if (!["recommended","required","reference"].includes(kind)) throw new AppError("Invalid assignment kind.", 400, "INVALID_ASSIGNMENT_KIND");
    const id = createId();
    const classId = optionalString(body.classId, 120);
    const studentId = optionalString(body.studentId, 120);
    const subjectId = optionalString(body.subjectId, 120);
    if (studentId) {
      const student = await tx.$queryRawUnsafe<Row[]>(`SELECT "id" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active'`, schoolId, studentId);
      if (!student[0]) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");
    }
    const book = await tx.$queryRawUnsafe<Row[]>(`SELECT "id" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 AND "archivedAt" IS NULL`, schoolId, bookId);
    if (!book[0]) throw new AppError("Library resource not found.", 404, "RESOURCE_NOT_FOUND");
    const dueAt = body.dueAt ? new Date(stringValue(body.dueAt, "dueAt", 100)) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) throw new AppError("Invalid resource due date.", 400, "INVALID_DUE_DATE");
    await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryResourceAssignment" ("id","schoolId","bookId","classId","studentId","subjectId","kind","note","dueAt","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)`, id, schoolId, bookId, classId, studentId, subjectId, kind, optionalString(body.note, 2000), dueAt, userId);
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.resource_assigned", entityType: "P3LibraryResourceAssignment", entityId: id, after: { bookId, classId, studentId, subjectId, kind } });
    return { id };
  }

  throw new AppError("Unknown library resource action.", 400, "UNKNOWN_ACTION");
}

export async function libraryContentAccess(tx: TenantDb, actor: LibraryContentActor, bookId: string, mode: "read" | "download") {
  if (actor.kind === "school") {
    const [manage, borrow] = await Promise.all([hasPermission(tx, actor.userId, "library:manage"), hasPermission(tx, actor.userId, "library:borrow")]);
    if (!manage && !borrow) throw new AppError("You do not have permission to open library resources.", 403, "FORBIDDEN");
  } else {
    await requireGuardianBook(tx, { schoolId: actor.schoolId, guardianId: actor.guardianId, userId: actor.userId }, actor.studentId, bookId);
  }
  const book = await tx.$queryRawUnsafe<Array<{ id: string; title: string; fileUrl: string | null; readerEnabled: boolean; downloadAllowed: boolean; archivedAt: Date | null }>>(`SELECT "id","title","fileUrl","readerEnabled","downloadAllowed","archivedAt" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, actor.schoolId, bookId);
  const resource = book[0];
  if (!resource || resource.archivedAt) throw new AppError("Library resource not found.", 404, "RESOURCE_NOT_FOUND");
  if (!resource.fileUrl || !safeResourceUrl(resource.fileUrl)) throw new AppError("This resource has no protected digital source.", 409, "DIGITAL_SOURCE_MISSING");
  if (!resource.readerEnabled) throw new AppError("Online reading is disabled for this resource.", 403, "READER_DISABLED");
  if (mode === "download" && !resource.downloadAllowed) throw new AppError("The school has made this resource read-only. Downloading is not permitted.", 403, "DOWNLOAD_DISABLED");
  return { id: resource.id, title: resource.title, sourceUrl: resource.fileUrl, downloadAllowed: resource.downloadAllowed };
}
