import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";
import { appendSchoolAudit } from "./audit";
import { safeResourceUrl } from "./resource-url";

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AppError(`${field} is required.`, 400, "INVALID_INPUT");
  return value.trim();
}
function optionalText(value: unknown, max = 1000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AppError("Invalid text value.", 400, "INVALID_INPUT");
  return value.trim() || null;
}
function numberValue(value: unknown, field: string, min = 0, max = 1000000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(`${field} is invalid.`, 400, "INVALID_INPUT");
  return n;
}
function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  throw new AppError("Invalid yes/no value.", 400, "INVALID_INPUT");
}
function resourceUrl(value: unknown) {
  const raw = optionalText(value, 2000);
  if (!raw) return null;
  const url = safeResourceUrl(raw);
  if (!url) throw new AppError("Resource links must use HTTP, HTTPS or a same-site path.", 400, "INVALID_RESOURCE_URL");
  return url;
}
async function borrowerStudents(tx: TenantDb, schoolId: string, userId: string, canManage: boolean) {
  return tx.$queryRawUnsafe<Array<{ id: string; name: string; admissionNo: string; status: string }>>(`SELECT s."id",s."name",s."admissionNo",s."status" FROM "Student" s WHERE s."schoolId"=$1 AND ($3::boolean OR EXISTS (SELECT 1 FROM "StudentGuardian" sg JOIN "Guardian" g ON g."id"=sg."guardianId" AND g."schoolId"=sg."schoolId" WHERE sg."schoolId"=s."schoolId" AND sg."studentId"=s."id" AND g."userId"=$2) OR EXISTS (SELECT 1 FROM "Class" c WHERE c."schoolId"=s."schoolId" AND c."id"=s."classId" AND c."classTeacherId"=$2) OR EXISTS (SELECT 1 FROM "ClassSubjectTeacher" cst WHERE cst."schoolId"=s."schoolId" AND cst."classId"=s."classId" AND cst."teacherId"=$2)) ORDER BY s."name"`, schoolId, userId, canManage);
}
async function requireLinkedStudentForBorrower(tx: TenantDb, schoolId: string, userId: string, studentId: string, canManage: boolean) {
  if (canManage) return;
  const students = await borrowerStudents(tx, schoolId, userId, false);
  if (!students.some(student => student.id === studentId)) throw new AppError("Library circulation is limited to your linked children or assigned classes.", 403, "FORBIDDEN");
}

export async function libraryOverview(tx: TenantDb, schoolId: string, userId: string) {
  const [canManage, canBorrow] = await Promise.all([hasPermission(tx, userId, "library:manage"), hasPermission(tx, userId, "library:borrow")]);
  if (!canManage && !canBorrow) throw new AppError("You do not have permission to access the library.", 403, "FORBIDDEN");
  const students = await borrowerStudents(tx, schoolId, userId, canManage);
  const studentIds = students.map(student => student.id);
  const [books, loans, copies, reservations, assignments] = await Promise.all([
    tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "id","schoolId","isbn","title","author","category","copies","availableCopies","materialType","coverUrl","description","publisher","publishedYear","language","tags","accessibility","readerEnabled","downloadAllowed","visibility","audience","rightsNote","estimatedMinutes","archivedAt","createdAt","updatedAt",("fileUrl" IS NOT NULL) AS "digitalSourceConfigured",CASE WHEN $2::boolean THEN "fileUrl" ELSE NULL END AS "fileUrl" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "archivedAt" IS NULL ORDER BY "title"`, schoolId, canManage),
    tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT l.*,b."title" AS "bookTitle",s."name" AS "studentName",c."accessionNo",c."barcode", CASE WHEN l."status"='borrowed' AND l."dueAt"<CURRENT_TIMESTAMP THEN 'overdue' ELSE l."status" END AS "displayStatus" FROM "P3LibraryLoan" l JOIN "P3LibraryBook" b ON b."id"=l."bookId" AND b."schoolId"=l."schoolId" JOIN "Student" s ON s."id"=l."studentId" AND s."schoolId"=l."schoolId" LEFT JOIN "P3LibraryCopy" c ON c."id"=l."copyId" AND c."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND ($3::boolean OR l."studentId"=ANY($2::text[])) ORDER BY l."borrowedAt" DESC LIMIT 500`, schoolId, studentIds, canManage),
    canManage ? tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT c.*,b."title" AS "bookTitle" FROM "P3LibraryCopy" c JOIN "P3LibraryBook" b ON b."id"=c."bookId" AND b."schoolId"=c."schoolId" WHERE c."schoolId"=$1 ORDER BY b."title",c."accessionNo" LIMIT 2000`, schoolId) : Promise.resolve([]),
    tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT r.*,b."title" AS "bookTitle",s."name" AS "studentName" FROM "P3LibraryReservation" r JOIN "P3LibraryBook" b ON b."id"=r."bookId" AND b."schoolId"=r."schoolId" JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND ($3::boolean OR r."studentId"=ANY($2::text[])) AND r."status" IN ('waiting','ready') ORDER BY r."requestedAt" LIMIT 500`, schoolId, studentIds, canManage),
    canManage ? tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT a.*,b."title" AS "bookTitle",c."name" AS "className",s."name" AS "studentName",sub."name" AS "subjectName" FROM "P3LibraryResourceAssignment" a JOIN "P3LibraryBook" b ON b."id"=a."bookId" AND b."schoolId"=a."schoolId" LEFT JOIN "Class" c ON c."id"=a."classId" AND c."schoolId"=a."schoolId" LEFT JOIN "Student" s ON s."id"=a."studentId" AND s."schoolId"=a."schoolId" LEFT JOIN "Subject" sub ON sub."id"=a."subjectId" AND sub."schoolId"=a."schoolId" WHERE a."schoolId"=$1 ORDER BY a."createdAt" DESC LIMIT 1000`, schoolId) : Promise.resolve([]),
  ]);
  return {
    books: books.map((book): Record<string, unknown> => ({
      ...book,
      fileUrl: canManage ? safeResourceUrl(book.fileUrl) : null,
      coverUrl: safeResourceUrl(book.coverUrl),
      digitalAvailable: Boolean(book.digitalSourceConfigured && book.readerEnabled),
      downloadAllowed: Boolean(book.digitalSourceConfigured && book.readerEnabled && book.downloadAllowed),
    })),
    loans,
    copies,
    reservations,
    assignments,
    students: students.filter(student => student.status === "active"),
    canManage,
    canBorrow: canManage || canBorrow,
  };
}

export async function libraryAction(tx: TenantDb, schoolId: string, userId: string, body: Record<string, unknown>) {
  const action = text(body.action, "action", 80);
  const input = body as Record<string, unknown>;
  if (action === "createBook") {
    await requirePermission(tx, userId, "library:manage");
    const id = createId();
    const copies = numberValue(input.copies ?? 1, "copies", 1, 100000);
    const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags.slice(0, 30).map(String)) : "[]";
    const accessibility = input.accessibility && typeof input.accessibility === "object" ? JSON.stringify(input.accessibility) : "{}";
    const readerEnabled = booleanValue(input.readerEnabled, true);
    const downloadAllowed = booleanValue(input.downloadAllowed, false);
    if (downloadAllowed && !readerEnabled) throw new AppError("Downloads can be enabled only when protected reader access is enabled.", 400, "INVALID_ACCESS_POLICY");
    const visibility = optionalText(input.visibility, 30) ?? "school";
    if (!["school", "staff", "restricted"].includes(visibility)) throw new AppError("Choose a valid resource visibility.", 400, "INVALID_VISIBILITY");
    const audience = input.audience && typeof input.audience === "object" && !Array.isArray(input.audience) ? JSON.stringify(input.audience) : "{}";
    const estimatedMinutes = input.estimatedMinutes === undefined || input.estimatedMinutes === "" ? null : numberValue(input.estimatedMinutes, "estimatedMinutes", 1, 100000);
    await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryBook" ("id","schoolId","isbn","title","author","category","copies","availableCopies","materialType","coverUrl","fileUrl","description","publisher","publishedYear","language","tags","accessibility","readerEnabled","downloadAllowed","visibility","audience","rightsNote","estimatedMinutes","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20::jsonb,$21,$22,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, schoolId, optionalText(input.isbn, 100), text(input.title, "title"), optionalText(input.author, 200), text(input.category ?? "General", "category", 120), copies, optionalText(input.materialType, 60) ?? "book", resourceUrl(input.coverUrl), resourceUrl(input.fileUrl), optionalText(input.description, 5000), optionalText(input.publisher, 300), input.publishedYear === undefined || input.publishedYear === "" ? null : numberValue(input.publishedYear, "publishedYear", 0, 3000), optionalText(input.language, 80), tags, accessibility, readerEnabled, downloadAllowed, visibility, audience, optionalText(input.rightsNote, 3000), estimatedMinutes);
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_created", entityType: "P3LibraryBook", entityId: id, after: { title: input.title, copies, readerEnabled, downloadAllowed, visibility } });
    return { id };
  }
  if (action === "updateBook") {
    await requirePermission(tx, userId, "library:manage");
    const bookId = text(input.bookId, "bookId", 100);
    const title = optionalText(input.title, 500);
    const author = optionalText(input.author, 200);
    const category = optionalText(input.category, 120);
    const description = optionalText(input.description, 5000);
    const updated = await tx.$queryRawUnsafe<Array<{ id: string }>>(`UPDATE "P3LibraryBook" SET "title"=COALESCE($3,"title"),"author"=COALESCE($4,"author"),"category"=COALESCE($5,"category"),"description"=COALESCE($6,"description"),"coverUrl"=COALESCE($7,"coverUrl"),"fileUrl"=COALESCE($8,"fileUrl"),"materialType"=COALESCE($9,"materialType"),"tags"=COALESCE($10::jsonb,"tags"),"accessibility"=COALESCE($11::jsonb,"accessibility"),"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 RETURNING "id"`, schoolId, bookId, title, author, category, description, resourceUrl(input.coverUrl), resourceUrl(input.fileUrl), optionalText(input.materialType, 60), input.tags === undefined ? null : JSON.stringify(input.tags), input.accessibility === undefined ? null : JSON.stringify(input.accessibility));
    if (!updated[0]) throw new AppError("Book not found.", 404, "BOOK_NOT_FOUND");
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_updated", entityType: "P3LibraryBook", entityId: bookId });
    return { id: bookId };
  }
  if (action === "borrow") {
    if (!(await hasPermission(tx, userId, "library:manage"))) await requirePermission(tx, userId, "library:borrow");
    const canManage = await hasPermission(tx, userId, "library:manage");
    const bookId = text(input.bookId, "bookId", 100);
    const studentId = text(input.studentId, "studentId", 100);
    const days = numberValue(input.days ?? 14, "days", 1, 365);
    const dueAt = input.dueAt ? new Date(text(input.dueAt, "dueAt", 100)) : new Date(Date.now() + days * 86400000);
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now() || dueAt.getTime() > Date.now() + 366 * 86400000) throw new AppError("Choose a due date within the next year.", 400, "INVALID_DUE_DATE");
    await requireLinkedStudentForBorrower(tx, schoolId, userId, studentId, canManage);
    const student = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, schoolId, studentId);
    if (!student[0]) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${schoolId}:${bookId}`}))`;
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "bookId"=$2 AND "studentId"=$3 AND "status"='borrowed' ORDER BY "borrowedAt" LIMIT 1`, schoolId, bookId, studentId);
    if (existing[0]) return { id: existing[0].id, alreadyBorrowed: true };
    const available = await tx.$queryRawUnsafe<Array<{ availableCopies: number }>>(`SELECT "availableCopies" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, schoolId, bookId);
    if (!available[0] || Number(available[0].availableCopies) < 1) throw new AppError("No available copy remains.", 409, "BOOK_UNAVAILABLE");
    const copy = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "P3LibraryCopy" WHERE "schoolId"=$1 AND "bookId"=$2 AND "status"='available' ORDER BY "accessionNo" LIMIT 1 FOR UPDATE`, schoolId, bookId);
    const loanId = createId();
    await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryLoan" ("id","schoolId","bookId","copyId","studentId","borrowedAt","dueAt","status","issuedBy","createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6::timestamp,'borrowed',$7,CURRENT_TIMESTAMP)`, loanId, schoolId, bookId, copy[0]?.id ?? null, studentId, dueAt, userId);
    if (copy[0]) await tx.$queryRawUnsafe(`UPDATE "P3LibraryCopy" SET "status"='on_loan',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, schoolId, copy[0].id);
    await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"="availableCopies"-1,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "availableCopies">0`, schoolId, bookId);
    await tx.$queryRawUnsafe(`UPDATE "P3LibraryReservation" SET "status"='fulfilled',"fulfilledAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "bookId"=$2 AND "studentId"=$3 AND "status" IN ('waiting','ready')`, schoolId, bookId, studentId);
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_borrowed", entityType: "P3LibraryLoan", entityId: loanId, after: { bookId, copyId: copy[0]?.id ?? null, studentId, dueAt: dueAt.toISOString() } });
    return { id: loanId, copyId: copy[0]?.id ?? null };
  }
  if (action === "return") {
    if (!(await hasPermission(tx, userId, "library:manage"))) await requirePermission(tx, userId, "library:borrow");
    const canManage = await hasPermission(tx, userId, "library:manage");
    const loanId = text(input.loanId, "loanId", 100);
    const loan = await tx.$queryRawUnsafe<Array<{ bookId: string; copyId: string | null; studentId: string; status: string }>>(`SELECT "bookId","copyId","studentId","status" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "id"=$2`, schoolId, loanId);
    if (!loan[0]) throw new AppError("Loan not found.", 404, "LOAN_NOT_FOUND");
    await requireLinkedStudentForBorrower(tx, schoolId, userId, loan[0].studentId, canManage);
    if (loan[0].status === "returned") return { id: loanId, alreadyReturned: true };
    if (loan[0].status !== "borrowed") throw new AppError("This loan is not open for return.", 409, "LOAN_CLOSED");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${schoolId}:${loan[0].bookId}`}))`;
    const returned = await tx.$queryRawUnsafe<Array<{ id: string }>>(`UPDATE "P3LibraryLoan" SET "status"='returned',"returnedAt"=CURRENT_TIMESTAMP,"returnedBy"=$3 WHERE "schoolId"=$1 AND "id"=$2 AND "status"='borrowed' RETURNING "id"`, schoolId, loanId, userId);
    if (!returned[0]) return { id: loanId, alreadyReturned: true };
    if (loan[0].copyId) await tx.$queryRawUnsafe(`UPDATE "P3LibraryCopy" SET "status"='available',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "status"='on_loan'`, schoolId, loan[0].copyId);
    await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"=LEAST("copies","availableCopies"+1),"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, schoolId, loan[0].bookId);
    await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_returned", entityType: "P3LibraryLoan", entityId: loanId, after: { bookId: loan[0].bookId, copyId: loan[0].copyId, studentId: loan[0].studentId } });
    return { id: loanId };
  }
  throw new AppError("Unknown library action.", 400, "UNKNOWN_ACTION");
}
