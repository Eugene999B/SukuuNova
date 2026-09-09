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
  const [canManage, canBorrow] = await Promise.all([hasPermission(tx,userId,"library:manage"),hasPermission(tx,userId,"library:borrow")]);
  if (!canManage && !canBorrow) throw new AppError("You do not have permission to access the library.",403,"FORBIDDEN");
  const students = await borrowerStudents(tx,schoolId,userId,canManage);
  const [books, loans] = await Promise.all([
    tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "P3LibraryBook" WHERE "schoolId"=$1 ORDER BY "title"`,schoolId),
    tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT l.*,b."title" AS "bookTitle",s."name" AS "studentName", CASE WHEN l."status"='borrowed' AND l."dueAt"<CURRENT_TIMESTAMP THEN 'overdue' ELSE l."status" END AS "displayStatus" FROM "P3LibraryLoan" l JOIN "P3LibraryBook" b ON b."id"=l."bookId" AND b."schoolId"=l."schoolId" JOIN "Student" s ON s."id"=l."studentId" AND s."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND ($3::boolean OR l."studentId"=ANY($2::text[])) ORDER BY l."borrowedAt" DESC LIMIT 300`,schoolId,students.map(student=>student.id),canManage)
  ]);
  return { books: books.map((book): Record<string, unknown> =>({...book,fileUrl:safeResourceUrl(book.fileUrl),coverUrl:safeResourceUrl(book.coverUrl)})), loans, students: students.filter(student=>student.status==="active"), canManage, canBorrow:canManage||canBorrow };
}
export async function libraryAction(tx: TenantDb, schoolId: string, userId: string, body: Record<string, unknown>) {
  const action = text(body.action,"action",80);
      const input = body as Record<string, unknown>;
      if (action === "createBook") {
        await requirePermission(tx, userId, "library:manage");
        const id = createId();
        const copies = numberValue(input.copies ?? 1, "copies", 1, 100000);
        const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags.slice(0, 30).map(String)) : "[]";
        const accessibility = input.accessibility && typeof input.accessibility === "object" ? JSON.stringify(input.accessibility) : "{}";
        await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryBook" ("id","schoolId","isbn","title","author","category","copies","availableCopies","materialType","coverUrl","fileUrl","description","publisher","publishedYear","language","tags","accessibility","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,CURRENT_TIMESTAMP)`, id, schoolId, optionalText(input.isbn, 100), text(input.title, "title"), optionalText(input.author, 200), text(input.category ?? "General", "category", 120), copies, optionalText(input.materialType, 60) ?? "book", resourceUrl(input.coverUrl), resourceUrl(input.fileUrl), optionalText(input.description, 5000), optionalText(input.publisher, 300), input.publishedYear === undefined || input.publishedYear === "" ? null : numberValue(input.publishedYear, "publishedYear", 0, 3000), optionalText(input.language, 80), tags, accessibility);
        await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_created", entityType: "P3LibraryBook", entityId: id, after: { title: input.title, copies } });
        return { id };
      }
      if (action === "updateBook") {
        await requirePermission(tx, userId, "library:manage");
        const bookId = text(input.bookId, "bookId", 100);
        const title = optionalText(input.title, 500);
        const author = optionalText(input.author, 200);
        const category = optionalText(input.category, 120);
        const description = optionalText(input.description, 5000);
        const updated = await tx.$queryRawUnsafe<Array<{ id: string }>>(`UPDATE "P3LibraryBook" SET "title"=COALESCE($3,"title"),"author"=COALESCE($4,"author"),"category"=COALESCE($5,"category"),"description"=COALESCE($6,"description"),"coverUrl"=COALESCE($7,"coverUrl"),"fileUrl"=COALESCE($8,"fileUrl"),"materialType"=COALESCE($9,"materialType"),"tags"=COALESCE($10::jsonb,"tags"),"accessibility"=COALESCE($11::jsonb,"accessibility") WHERE "schoolId"=$1 AND "id"=$2 RETURNING "id"`, schoolId, bookId, title, author, category, description, resourceUrl(input.coverUrl), resourceUrl(input.fileUrl), optionalText(input.materialType, 60), input.tags === undefined ? null : JSON.stringify(input.tags), input.accessibility === undefined ? null : JSON.stringify(input.accessibility));
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
        const loanId = createId();
        await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryLoan" ("id","schoolId","bookId","studentId","borrowedAt","dueAt","status","issuedBy","createdAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,$5::timestamp,'borrowed',$6,CURRENT_TIMESTAMP)`, loanId, schoolId, bookId, studentId, dueAt, userId);
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"="availableCopies"-1 WHERE "schoolId"=$1 AND "id"=$2 AND "availableCopies">0`, schoolId, bookId);
        await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_borrowed", entityType: "P3LibraryLoan", entityId: loanId, after: { bookId, studentId, dueAt: dueAt.toISOString() } });
        return { id: loanId };
      }
      if (action === "return") {
        if (!(await hasPermission(tx, userId, "library:manage"))) await requirePermission(tx, userId, "library:borrow");
        const canManage = await hasPermission(tx, userId, "library:manage");
        const loanId = text(input.loanId, "loanId", 100);
        const loan = await tx.$queryRawUnsafe<Array<{ bookId: string; studentId: string; status: string }>>(`SELECT "bookId","studentId","status" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "id"=$2`, schoolId, loanId);
        if (!loan[0]) throw new AppError("Loan not found.", 404, "LOAN_NOT_FOUND");
        await requireLinkedStudentForBorrower(tx, schoolId, userId, loan[0].studentId, canManage);
        if (loan[0].status === "returned") return { id: loanId, alreadyReturned: true };
        if (loan[0].status !== "borrowed") throw new AppError("This loan is not open for return.", 409, "LOAN_CLOSED");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${schoolId}:${loan[0].bookId}`}))`;
        const returned = await tx.$queryRawUnsafe<Array<{ id: string }>>(`UPDATE "P3LibraryLoan" SET "status"='returned',"returnedAt"=CURRENT_TIMESTAMP,"returnedBy"=$3 WHERE "schoolId"=$1 AND "id"=$2 AND "status"='borrowed' RETURNING "id"`, schoolId, loanId, userId);
        if (!returned[0]) return { id: loanId, alreadyReturned: true };
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"=LEAST("copies","availableCopies"+1) WHERE "schoolId"=$1 AND "id"=$2`, schoolId, loan[0].bookId);
        await appendSchoolAudit(tx, { schoolId, actorId: userId, action: "library.book_returned", entityType: "P3LibraryLoan", entityId: loanId, after: { bookId: loan[0].bookId, studentId: loan[0].studentId } });
        return { id: loanId };
      }
      throw new AppError("Unknown library action.", 400, "UNKNOWN_ACTION");
}
