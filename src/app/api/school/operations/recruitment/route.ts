import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AppError(`${field} is required.`, 400, "INVALID_INPUT");
  return value.trim();
}
function optionalText(value: unknown, max = 5000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AppError("Invalid text value.", 400, "INVALID_INPUT");
  return value.trim() || null;
}
function questions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => {
    if (!item || typeof item !== "object") return null;
    const q = item as Record<string, unknown>;
    return { id: typeof q.id === "string" ? q.id : createId(), label: text(q.label, "question", 300), type: typeof q.type === "string" ? q.type : "longText", required: Boolean(q.required), options: Array.isArray(q.options) ? q.options.slice(0, 10).map(String) : [] };
  }).filter(Boolean);
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "recruitment:manage");
      const [postings, applicants] = await Promise.all([
        tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`, session.schoolId),
        tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "P3Applicant" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT 1000`, session.schoolId),
      ]);
      return { postings, applicants };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Request body must be an object.", 400, "INVALID_INPUT");
    const input = body as Record<string, unknown>;
    const action = text(input.action, "action", 80);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "recruitment:manage");
      if (action === "createPosting") {
        const id = createId();
        const publicToken = createId();
        const closingDate = input.closingDate ? new Date(String(input.closingDate)) : null;
        if (closingDate && Number.isNaN(closingDate.getTime())) throw new AppError("closingDate is invalid.", 400, "INVALID_INPUT");
        const qs = JSON.stringify(questions(input.screeningQuestions));
        await tx.$queryRawUnsafe(`INSERT INTO "P3RecruitmentPosting" ("id","schoolId","title","department","employmentType","description","status","closingDate","createdBy","createdAt","publicToken","instructions","screeningQuestions") VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,CURRENT_TIMESTAMP,$9,$10,$11::jsonb)`, id, session.schoolId, text(input.title, "title"), optionalText(input.department, 160), optionalText(input.employmentType, 120), optionalText(input.description, 10000), closingDate, session.userId, publicToken, optionalText(input.instructions, 6000), qs);
        return { id, publicToken };
      }
      if (action === "updatePosting") {
        const postingId = text(input.postingId, "postingId", 100);
        const closingDate = input.closingDate ? new Date(String(input.closingDate)) : null;
        if (closingDate && Number.isNaN(closingDate.getTime())) throw new AppError("closingDate is invalid.", 400, "INVALID_INPUT");
        await tx.$queryRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "title"=COALESCE($3,"title"),"department"=COALESCE($4,"department"),"employmentType"=COALESCE($5,"employmentType"),"description"=COALESCE($6,"description"),"status"=COALESCE($7,"status"),"closingDate"=$8,"instructions"=COALESCE($9,"instructions"),"screeningQuestions"=COALESCE($10::jsonb,"screeningQuestions") WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, postingId, optionalText(input.title, 500), optionalText(input.department, 160), optionalText(input.employmentType, 120), optionalText(input.description, 10000), optionalText(input.status, 40), closingDate, optionalText(input.instructions, 6000), input.screeningQuestions === undefined ? null : JSON.stringify(questions(input.screeningQuestions)));
        return { id: postingId };
      }
      if (action === "setStatus") {
        const postingId = text(input.postingId, "postingId", 100);
        const status = text(input.status, "status", 40);
        if (!["open", "paused", "closed"].includes(status)) throw new AppError("Unsupported vacancy status.", 400, "INVALID_INPUT");
        await tx.$queryRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "status"=$3 WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, postingId, status);
        return { id: postingId, status };
      }
      if (action === "getPublicLink") {
        const postingId = text(input.postingId, "postingId", 100);
        const rows = await tx.$queryRawUnsafe<Array<{publicToken:string|null}>>(`SELECT "publicToken" FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, postingId);
        if (!rows[0]) throw new AppError("Vacancy not found.", 404, "NOT_FOUND");
        const token = rows[0].publicToken ?? createId();
        if (!rows[0].publicToken) await tx.$queryRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "publicToken"=$3 WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, postingId, token);
        return { postingId, publicToken: token };
      }
      throw new AppError("Unknown recruitment action.", 400, "UNKNOWN_ACTION");
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
