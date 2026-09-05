import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";
import { withTenant } from "./db";
import { generateReportCard } from "./report-card-service";

const PROMPT_VERSION = "sukuu-ai-v3";
const AI_TIMEOUT_MS = 15_000;

export const AiDraftSchema = z.object({
  draft: z.string().min(1).max(1000),
  evidence: z.array(z.string()).max(5),
  cautions: z.array(z.string()).max(5)
});

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AppError(field + " is required.", 400, "INVALID_INPUT");
  return value.trim();
}

function optionalText(value: unknown, max = 500) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AppError("Invalid text value.", 400, "INVALID_INPUT");
  return value.trim() || null;
}

function inputHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function providerModel() { return process.env.OPENAI_MODEL || "gpt-4o-mini"; }

function providerUrl() {
  const raw = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new AppError("AI provider URL is invalid.", 503, "AI_NOT_CONFIGURED"); }
  if (parsed.protocol !== "https:") throw new AppError("AI provider URL must use HTTPS.", 503, "AI_NOT_CONFIGURED");
  if (process.env.NODE_ENV === "production" && parsed.hostname !== "api.openai.com") {
    throw new AppError("Unapproved AI provider endpoint.", 503, "AI_PROVIDER_NOT_ALLOWED");
  }
  return parsed.toString();
}

async function callStructuredAi(prompt: string, allowedEvidence: string[], system: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError("AI provider is not configured.", 503, "AI_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(providerUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ model: providerModel(), input: [{ role: "system", content: system }, { role: "user", content: prompt }], max_output_tokens: 1200 }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
  } catch {
    throw new AppError("AI provider request timed out or could not be reached.", 504, "AI_PROVIDER_TIMEOUT");
  }
  if (!response.ok) throw new AppError("AI provider request failed.", 502, "AI_PROVIDER_ERROR");
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const direct = typeof data.output_text === "string" ? data.output_text : "";
  const combined = (data.output ?? []).flatMap((item) => item.content ?? []).map((part) => part.text || "").filter(Boolean).join("\n").trim();
  const raw = (direct || combined).trim();
  if (!raw) throw new AppError("AI provider returned no draft.", 502, "AI_EMPTY");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new AppError("AI provider returned non-JSON output.", 502, "AI_INVALID_OUTPUT"); }
  const structured = AiDraftSchema.safeParse(parsed);
  if (!structured.success) throw new AppError("AI provider returned an invalid draft structure.", 502, "AI_INVALID_OUTPUT");
  if (structured.data.evidence.some((item) => !allowedEvidence.includes(item))) throw new AppError("AI provider returned evidence not present in deterministic school data.", 502, "AI_INVALID_EVIDENCE");
  return structured.data;
}

export async function createStructuredAiDraft(input: { schoolId: string; actorId: string; type: "lesson_note" | "report_card_remark"; context: Record<string, unknown> }) {
  return withTenant(input.schoolId, async (tx) => {
    if (!(await hasPermission(tx, input.actorId, "ai_drafts:accept"))) throw new ForbiddenError("AI draft access is not permitted.");
    let safe: Record<string, unknown>; let evidence: string[]; let recordIds: string[];
    if (input.type === "report_card_remark") {
      const studentId = text(input.context.studentId, "studentId", 100); const termId = text(input.context.termId, "termId", 100);
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, class: { select: { name: true } } } });
      if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");
      const scores = await tx.score.findMany({ where: { studentId }, select: { id: true, value: true, assessment: { select: { maxScore: true } } }, orderBy: { enteredAt: "desc" }, take: 8 });
      const attendance = await tx.attendanceEvent.count({ where: { studentId, type: "in" } });
      const recentAverage = scores.length ? Number((scores.reduce((sum, row) => sum + Number(row.value) / Number(row.assessment.maxScore) * 100, 0) / scores.length).toFixed(1)) : null;
      evidence = [`Learner: ${student.id.slice(0, 12)}`, `Recent score average: ${recentAverage === null ? "no scored assessments" : recentAverage + "%"}`, `Recorded attendance check-ins: ${attendance}`];
      safe = { learnerRef: student.id.slice(0, 12), termId, recentScoreAverage: recentAverage, attendanceCheckIns: attendance };
      recordIds = [studentId, termId, ...scores.map((row) => row.id)];
    } else {
      const scoreId = optionalText(input.context.scoreId, 100);
      safe = { subject: optionalText(input.context.subject, 120), topic: text(input.context.topic, "topic", 240), objectives: optionalText(input.context.objectives, 1000), className: optionalText(input.context.className, 120), scoreId };
      evidence = [`Subject: ${safe.subject ?? "unspecified"}`, `Topic: ${safe.topic}`, `Class: ${safe.className ?? "unspecified"}`];
      recordIds = scoreId ? [scoreId] : [];
    }
    const system = "Return JSON only with exactly {draft,evidence,cautions}. draft is the proposed language only. evidence must contain only exact strings from the supplied deterministic evidence list. Do not invent school facts, diagnoses, grades, attendance, or events. Never request or expose personal data. cautions should state uncertainty when the evidence is incomplete.";
    const structured = await callStructuredAi(JSON.stringify({ data: safe, evidence }), evidence, system);
    const requestId = randomBytes(16).toString("hex"); const hash = inputHash(safe);
    await tx.$executeRaw`INSERT INTO "AiRequest" ("id","schoolId","userId","featureName","promptVersion","model","inputRecordIds","inputDataHash","output","approvalStatus") VALUES (${requestId},${input.schoolId},${input.actorId},${input.type},${PROMPT_VERSION},${providerModel()},${JSON.stringify(recordIds)}::jsonb,${hash},${JSON.stringify(structured)}::jsonb,'SUGGESTED')`;
    const draftId = randomBytes(16).toString("hex");
    await tx.$executeRaw`INSERT INTO "AiDraft" ("id","schoolId","type","context","draftText","status") VALUES (${draftId},${input.schoolId},${input.type},${JSON.stringify({ ...safe, requestId, evidence, cautions: structured.cautions })}::jsonb,${structured.draft},'suggested')`;
    return { id: draftId, requestId, type: input.type, status: "suggested" as const, draftText: structured.draft, evidence: structured.evidence, cautions: structured.cautions };
  });
}

export async function acceptStructuredAiDraft(input: { schoolId: string; actorId: string; draftId: string; editedText?: string }) {
  return withTenant(input.schoolId, async (tx) => {
    if (!(await hasPermission(tx, input.actorId, "ai_drafts:accept"))) throw new ForbiddenError("AI draft access is not permitted.");
    const row = (await tx.$queryRaw<Array<{ id: string; type: string; context: Record<string, unknown>; draftText: string; status: string }>>`SELECT "id","type","context","draftText","status" FROM "AiDraft" WHERE "id"=${input.draftId} AND "schoolId"=${input.schoolId} FOR UPDATE`)[0];
    if (!row) throw new AppError("AI draft not found.", 404, "NOT_FOUND");
    if (row.status !== "suggested") throw new AppError("AI draft is already decided.", 409, "DRAFT_CLOSED");
    const finalText = (input.editedText ?? row.draftText).trim();
    if (!finalText || finalText.length > 1000) throw new AppError("Accepted draft is invalid.", 400, "INVALID_INPUT");
    if (row.type === "report_card_remark") {
      await generateReportCard(tx, { schoolId: input.schoolId, actorId: input.actorId, studentId: text(row.context.studentId, "studentId", 100), termId: text(row.context.termId, "termId", 100), remarks: finalText });
    } else {
      const scoreId = optionalText(row.context.scoreId, 100);
      if (!scoreId) throw new AppError("Lesson-note drafts need a target score before acceptance.", 409, "AI_TARGET_REQUIRED");
      const changed = await tx.$executeRaw`UPDATE "Score" SET "remarks"=${finalText} WHERE "id"=${scoreId} AND "schoolId"=${input.schoolId}`;
      if (changed !== 1) throw new AppError("Target score not found.", 404, "NOT_FOUND");
    }
    const requestId = optionalText(row.context.requestId, 100);
    await tx.$executeRaw`UPDATE "AiDraft" SET "status"='accepted' WHERE "id"=${input.draftId} AND "schoolId"=${input.schoolId}`;
    if (requestId) await tx.$executeRaw`UPDATE "AiRequest" SET "approvalStatus"='ACCEPTED',"approvedAt"=NOW(),"approvedBy"=${input.actorId} WHERE "id"=${requestId} AND "schoolId"=${input.schoolId}`;
    return { ok: true, draftId: input.draftId, status: "accepted", text: finalText };
  });
}

export async function discardStructuredAiDraft(input: { schoolId: string; actorId: string; draftId: string }) {
  return withTenant(input.schoolId, async (tx) => {
    if (!(await hasPermission(tx, input.actorId, "ai_drafts:accept"))) throw new ForbiddenError("AI draft access is not permitted.");
    const row = (await tx.$queryRaw<Array<{ context: Record<string, unknown> }>>`SELECT "context" FROM "AiDraft" WHERE "id"=${input.draftId} AND "schoolId"=${input.schoolId} AND "status"='suggested' FOR UPDATE`)[0];
    if (!row) throw new AppError("AI draft is missing or already decided.", 409, "DRAFT_CLOSED");
    await tx.$executeRaw`UPDATE "AiDraft" SET "status"='discarded' WHERE "id"=${input.draftId} AND "schoolId"=${input.schoolId}`;
    const requestId = optionalText(row.context.requestId, 100);
    if (requestId) await tx.$executeRaw`UPDATE "AiRequest" SET "approvalStatus"='DISCARDED' WHERE "id"=${requestId} AND "schoolId"=${input.schoolId}`;
    return { ok: true, draftId: input.draftId, status: "discarded" };
  });
}
