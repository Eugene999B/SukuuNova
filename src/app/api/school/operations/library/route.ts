import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { createId } from "@paralleldrive/cuid2";

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

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      const canManage = await hasPermission(tx, session.userId, "library:manage");
      const canBorrow = await hasPermission(tx, session.userId, "library:borrow");
      if (!canManage && !canBorrow) throw new AppError("You do not have permission to access the library.", 403, "FORBIDDEN");
      const books = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "P3LibraryBook" WHERE "schoolId"=$1 ORDER BY "title"`, session.schoolId);
      const loans = canManage
        ? await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT *, CASE WHEN "status"='borrowed' AND "dueAt"<CURRENT_TIMESTAMP THEN 'overdue' ELSE "status" END AS "displayStatus" FROM "P3LibraryLoan" WHERE "schoolId"=$1 ORDER BY "borrowedAt" DESC LIMIT 300`, session.schoolId)
        : await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT *, CASE WHEN "status"='borrowed' AND "dueAt"<CURRENT_TIMESTAMP THEN 'overdue' ELSE "status" END AS "displayStatus" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "studentId" IN (SELECT sg."studentId" FROM "StudentGuardian" sg WHERE "sg"."guardianId" IN (SELECT g."id" FROM "Guardian" g WHERE g."userId"=$2)) ORDER BY "borrowedAt" DESC LIMIT 100`, session.schoolId, session.userId);
      return { books, loans, canManage, canBorrow };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Request body must be an object.", 400, "INVALID_INPUT");
    const action = text((body as Record<string, unknown>).action, "action", 80);
    const result = await withTenant(session.schoolId, async (tx) => {
      const input = body as Record<string, unknown>;
      if (action === "createBook") {
        await requirePermission(tx, session.userId, "library:manage");
        const id = createId();
        const copies = numberValue(input.copies ?? 1, "copies", 1, 100000);
        const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags.slice(0, 30).map(String)) : "[]";
        const accessibility = input.accessibility && typeof input.accessibility === "object" ? JSON.stringify(input.accessibility) : "{}";
        await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryBook" ("id","schoolId","isbn","title","author","category","copies","availableCopies","materialType","coverUrl","fileUrl","description","publisher","publishedYear","language","tags","accessibility","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,CURRENT_TIMESTAMP)`, id, session.schoolId, optionalText(input.isbn, 100), text(input.title, "title"), optionalText(input.author, 200), text(input.category, "category", 120), copies, optionalText(input.materialType, 60) ?? "book", optionalText(input.coverUrl, 1500), optionalText(input.fileUrl, 2000), optionalText(input.description, 5000), optionalText(input.publisher, 300), input.publishedYear === undefined || input.publishedYear === "" ? null : numberValue(input.publishedYear, "publishedYear", 0, 3000), optionalText(input.language, 80), tags, accessibility);
        return { id };
      }
      if (action === "updateBook") {
        await requirePermission(tx, session.userId, "library:manage");
        const bookId = text(input.bookId, "bookId", 100);
        const title = optionalText(input.title, 500);
        const author = optionalText(input.author, 200);
        const category = optionalText(input.category, 120);
        const description = optionalText(input.description, 5000);
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "title"=COALESCE($3,"title"),"author"=COALESCE($4,"author"),"category"=COALESCE($5,"category"),"description"=COALESCE($6,"description"),"coverUrl"=COALESCE($7,"coverUrl"),"fileUrl"=COALESCE($8,"fileUrl"),"materialType"=COALESCE($9,"materialType"),"tags"=COALESCE($10::jsonb,"tags"),"accessibility"=COALESCE($11::jsonb,"accessibility") WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, bookId, title, author, category, description, optionalText(input.coverUrl, 1500), optionalText(input.fileUrl, 2000), optionalText(input.materialType, 60), input.tags === undefined ? null : JSON.stringify(input.tags), input.accessibility === undefined ? null : JSON.stringify(input.accessibility));
        return { id: bookId };
      }
      if (action === "borrow") {
        await requirePermission(tx, session.userId, "library:borrow");
        const bookId = text(input.bookId, "bookId", 100);
        const studentId = text(input.studentId, "studentId", 100);
        const days = numberValue(input.days ?? 14, "days", 1, 365);
        const student = await tx.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "Student" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`, session.schoolId, studentId);
        if (!student[0]) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${session.schoolId}:${bookId}`}))`;
        const available = await tx.$queryRawUnsafe<Array<{availableCopies:number}>>(`SELECT "availableCopies" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, session.schoolId, bookId);
        if (!available[0] || Number(available[0].availableCopies) < 1) throw new AppError("No available copy remains.", 409, "BOOK_UNAVAILABLE");
        const loanId = createId();
        await tx.$queryRawUnsafe(`INSERT INTO "P3LibraryLoan" ("id","schoolId","bookId","studentId","borrowedAt","dueAt","status","issuedBy","createdAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + ($5 || ' days')::interval,'borrowed',$6,CURRENT_TIMESTAMP)`, loanId, session.schoolId, bookId, studentId, String(days), session.userId);
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"="availableCopies"-1 WHERE "schoolId"=$1 AND "id"=$2 AND "availableCopies">0`, session.schoolId, bookId);
        return { id: loanId };
      }
      if (action === "return") {
        await requirePermission(tx, session.userId, "library:borrow");
        const loanId = text(input.loanId, "loanId", 100);
        const loan = await tx.$queryRawUnsafe<Array<{bookId:string;status:string}>>(`SELECT "bookId","status" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, session.schoolId, loanId);
        if (!loan[0]) throw new AppError("Loan not found.", 404, "LOAN_NOT_FOUND");
        if (loan[0].status !== "borrowed") throw new AppError("This loan has already been returned.", 409, "LOAN_ALREADY_RETURNED");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-book:${session.schoolId}:${loan[0].bookId}`}))`;
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryLoan" SET "status"='returned',"returnedAt"=CURRENT_TIMESTAMP,"returnedBy"=$3 WHERE "schoolId"=$1 AND "id"=$2 AND "status"='borrowed'`, session.schoolId, loanId, session.userId);
        await tx.$queryRawUnsafe(`UPDATE "P3LibraryBook" SET "availableCopies"=LEAST("copies","availableCopies"+1) WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, loan[0].bookId);
        return { id: loanId };
      }
      throw new AppError("Unknown library action.", 400, "UNKNOWN_ACTION");
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
