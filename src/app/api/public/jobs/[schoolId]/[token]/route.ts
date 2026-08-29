import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AppError(`${field} is required.`, 400, "INVALID_INPUT");
  return value.trim();
}
function optionalText(value: unknown, max = 5000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AppError("Invalid application value.", 400, "INVALID_INPUT");
  return value.trim() || null;
}

async function loadPosting(schoolId: string, token: string) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "id","schoolId","title","department","employmentType","description","instructions","closingDate","status","screeningQuestions" FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 AND "publicToken"=$2 LIMIT 1`, schoolId, token);
    const posting = rows[0];
    if (!posting) throw new AppError("This application link is invalid.", 404, "NOT_FOUND");
    const closing = posting.closingDate ? new Date(String(posting.closingDate)) : null;
    if (posting.status !== "open" || (closing && closing.getTime() < Date.now())) throw new AppError("Applications for this vacancy are closed.", 410, "POSTING_CLOSED");
    return posting;
  });
}

export async function GET(_request: Request, context: { params: Promise<{ schoolId: string; token: string }> }) {
  try {
    const { schoolId, token } = await context.params;
    const posting = await loadPosting(schoolId, token);
    return NextResponse.json({ ok: true, posting });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ schoolId: string; token: string }> }) {
  try {
    const { schoolId, token } = await context.params;
    const posting = await loadPosting(schoolId, token);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Request body must be an object.", 400, "INVALID_INPUT");
    const input = body as Record<string, unknown>;
    const name = text(input.name, "name", 200);
    const email = optionalText(input.email, 320);
    const phone = optionalText(input.phone, 80);
    if (!email && !phone) throw new AppError("Email or phone is required.", 400, "INVALID_INPUT");
    const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
    const id = createId();
    await withTenant(schoolId, async (tx) => {
      await tx.$queryRawUnsafe(`INSERT INTO "P3Applicant" ("id","schoolId","postingId","name","email","phone","resumeUrl","status","notes","answers","coverLetter","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9::jsonb,$10,CURRENT_TIMESTAMP)`, id, schoolId, String(posting.id), name, email, phone, optionalText(input.resumeUrl, 2000), optionalText(input.notes, 4000), JSON.stringify(answers), optionalText(input.coverLetter, 12000));
    });
    return NextResponse.json({ ok: true, applicationId: id });
  } catch (error) { return routeError(error); }
}
