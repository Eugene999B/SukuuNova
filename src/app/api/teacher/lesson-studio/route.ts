import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSchoolAudit } from "@/lib/audit";
import { assertLessonSubmissionReady } from "@/lib/academic-authoring-service";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant, type TenantDb } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";

const blockSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(["heading", "paragraph", "bullet", "numbered", "quote", "callout", "image", "table"]),
  text: z.string().max(12000).optional(),
  url: z.string().max(3000).optional(),
  caption: z.string().max(500).optional(),
  rows: z.array(z.array(z.string().max(1000)).max(10)).max(20).optional(),
});
const fields = {
  title: z.string().trim().min(3).max(160),
  topic: z.string().trim().max(160).default(""),
  subTopic: z.string().trim().max(160).default(""),
  curriculumObjective: z.string().trim().max(1200).default(""),
  learningOutcomes: z.string().trim().max(3000).default(""),
  priorKnowledge: z.string().trim().max(2000).default(""),
  materials: z.string().trim().max(3000).default(""),
  introduction: z.string().trim().max(4000).default(""),
  development: z.string().trim().max(12000).default(""),
  differentiatedActivities: z.string().trim().max(5000).default(""),
  assessment: z.string().trim().max(5000).default(""),
  conclusion: z.string().trim().max(3000).default(""),
  homework: z.string().trim().max(3000).default(""),
  objective: z.string().trim().max(500).default(""),
  resources: z.array(z.object({ label: z.string().trim().min(1).max(160), url: z.string().url().max(2000) })).max(20).default([]),
  blocks: z.array(blockSchema).min(1).max(120),
};
const saveSchema = z.object({
  action: z.literal("save"),
  id: z.string().trim().min(1).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  classId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekNumber: z.number().int().min(1).max(60),
  status: z.enum(["draft", "submitted"]),
  ...fields,
});
const transitionSchema = z.object({ action: z.literal("transition"), id: z.string().trim().min(1), status: z.enum(["completed", "archived"]), reflection: z.string().trim().max(5000).optional() });
const inputSchema = z.discriminatedUnion("action", [saveSchema, transitionSchema]);

type LessonRow = {
  id: string; updatedAt: Date; classId: string; className: string; subjectId: string; subjectName: string; termId: string | null; termName: string | null;
  title: string; topic: string | null; subTopic: string | null; curriculumObjective: string | null; learningOutcomes: string | null; priorKnowledge: string | null;
  materials: string | null; introduction: string | null; development: string | null; differentiatedActivities: string | null; assessment: string | null; conclusion: string | null;
  homework: string | null; objective: string | null; content: string; resources: unknown; documentContent: unknown; plannedDate: Date; status: string; reviewNote: string | null;
  reviewerName: string | null; reviewedAt: Date | null; submittedAt: Date | null; completedAt: Date | null; reflection: string | null;
};

function plainText(blocks: z.infer<typeof blockSchema>[]) {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "image") { if (block.caption?.trim()) parts.push(`[Image] ${block.caption.trim()}`); continue; }
    if (block.type === "table") { for (const row of block.rows || []) parts.push(row.join(" | ")); continue; }
    const text = block.text?.trim(); if (text) parts.push(text);
  }
  return parts.join("\n\n").slice(0, 12000) || "Structured lesson document.";
}

async function context(tx: TenantDb, schoolId: string, userId: string) {
  const access = await getSchoolAuthorization(tx, userId);
  if (access.workspace !== "teacher" || !access.isTeacher) throw new ForbiddenError("Lesson authoring is only available inside the Teacher Workspace.");
  if (!(await hasPermission(tx, userId, "lesson_plans:manage"))) throw new ForbiddenError("You do not have lesson-plan authoring permission.");
  const [settings, terms, assignments] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true } }),
    tx.term.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true, academicYear: { select: { name: true } } } }),
    tx.classSubjectTeacher.findMany({ where: { schoolId, OR: [{ teacherId: userId }, { class: { classTeacherId: userId } }] }, select: { classId: true, subjectId: true, class: { select: { name: true, level: true } }, subject: { select: { name: true } } }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }] }),
  ]);
  const timezone = settings?.timezone || "Africa/Accra";
  const activeTerm = selectAcademicTerm(terms, undefined, new Date(), timezone);
  return { access, timezone, terms, activeTerm, assignments: Array.from(new Map(assignments.map((item) => [`${item.classId}:${item.subjectId}`, item])).values()) };
}

async function assertContext(tx: TenantDb, schoolId: string, userId: string, classId: string, subjectId: string, termId: string, plannedDate: string) {
  const ctx = await context(tx, schoolId, userId);
  if (!ctx.assignments.some((item) => item.classId === classId && item.subjectId === subjectId)) throw new ForbiddenError("That class and subject are outside your teaching scope.");
  const term = ctx.terms.find((item) => item.id === termId);
  if (!term) throw new AppError("The academic term is unavailable.", 404, "TERM_NOT_FOUND");
  const lifecycle = termLifecycle(term, new Date(), ctx.timezone);
  if (lifecycle.state !== "active") throw new AppError("Teachers can author or change lesson plans only in the active academic term.", 409, "TERM_NOT_ACTIVE");
  const planned = new Date(`${plannedDate}T00:00:00.000Z`);
  if (planned < term.startDate || planned > term.endDate) throw new AppError("The lesson date must be inside the active term.", 400, "DATE_OUTSIDE_TERM");
  return { ctx, term };
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      const ctx = await context(tx, session.schoolId, session.userId);
      const rows = await tx.$queryRawUnsafe<LessonRow[]>(`
        SELECT lp."id",lp."updatedAt",lp."classId",c."name" AS "className",lp."subjectId",s."name" AS "subjectName",lp."termId",t."name" AS "termName",
          lp."title",lp."topic",lp."subTopic",lp."curriculumObjective",lp."learningOutcomes",lp."priorKnowledge",lp."materials",lp."introduction",lp."development",
          lp."differentiatedActivities",lp."assessment",lp."conclusion",lp."homework",lp."objective",lp."content",lp."resources",lp."documentContent",lp."plannedDate",
          lp."status",lp."reviewNote",reviewer."name" AS "reviewerName",lp."reviewedAt",lp."submittedAt",lp."completedAt",lp."reflection"
        FROM "LessonPlan" lp
        JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
        JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
        LEFT JOIN "Term" t ON t."id"=lp."termId" AND t."schoolId"=lp."schoolId"
        LEFT JOIN "User" reviewer ON reviewer."id"=lp."reviewerId" AND reviewer."schoolId"=lp."schoolId"
        WHERE lp."schoolId"=$1 AND lp."teacherId"=$2
        ORDER BY lp."plannedDate" DESC,lp."updatedAt" DESC LIMIT 300`, session.schoolId, session.userId);
      return NextResponse.json({ assignments: ctx.assignments, terms: ctx.terms.map((term) => ({ ...term, lifecycle: termLifecycle(term, new Date(), ctx.timezone) })), activeTermId: ctx.activeTerm?.id ?? null, timezone: ctx.timezone, rows });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = inputSchema.parse(await request.json());
    return await withTenant(session.schoolId, async (tx) => {
      if (input.action === "transition") {
        const ctx = await context(tx, session.schoolId, session.userId);
        const rows = await tx.$queryRawUnsafe<Array<{ id: string; teacherId: string; status: string; termId: string | null }>>(`SELECT "id","teacherId","status","termId" FROM "LessonPlan" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, input.id);
        const current = rows[0];
        if (!current || current.teacherId !== session.userId) throw new ForbiddenError("You can only update your own lesson plan.");
        if (input.status === "completed") {
          if (current.status !== "approved") throw new AppError("Only an approved lesson can be marked taught/completed.", 409, "INVALID_TRANSITION");
          if (!input.reflection || input.reflection.length < 10) throw new AppError("Add a short teaching reflection before completing the lesson.", 400, "REFLECTION_REQUIRED");
        } else if (current.status !== "completed") throw new AppError("Only a completed lesson can be archived.", 409, "INVALID_TRANSITION");
        if (current.termId) {
          const term = ctx.terms.find((item) => item.id === current.termId);
          if (term?.isLocked) throw new AppError("This lesson belongs to a locked term.", 409, "TERM_LOCKED");
        }
        await tx.$executeRawUnsafe(`UPDATE "LessonPlan" SET "status"=$3,"reflection"=CASE WHEN $3='completed' THEN $4 ELSE "reflection" END,"completedAt"=CASE WHEN $3='completed' THEN NOW() ELSE "completedAt" END,"archivedAt"=CASE WHEN $3='archived' THEN NOW() ELSE "archivedAt" END,"updatedAt"=GREATEST(NOW(),"updatedAt"+INTERVAL '1 millisecond') WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, input.id, input.status, input.reflection ?? null);
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "lesson_plan.teacher_transition", entityType: "LessonPlan", entityId: input.id, before: { status: current.status }, after: { status: input.status } });
        return NextResponse.json({ ok: true });
      }

      await assertContext(tx, session.schoolId, session.userId, input.classId, input.subjectId, input.termId, input.plannedDate);
      const summary = plainText(input.blocks);
      const standard = { objective: input.objective || undefined, content: summary, topic: input.topic || undefined, subTopic: input.subTopic || undefined, curriculumObjective: input.curriculumObjective || undefined, learningOutcomes: input.learningOutcomes || undefined, priorKnowledge: input.priorKnowledge || undefined, materials: input.materials || undefined, introduction: input.introduction || undefined, development: input.development || undefined, differentiatedActivities: input.differentiatedActivities || undefined, assessment: input.assessment || undefined, conclusion: input.conclusion || undefined, homework: input.homework || undefined, resources: input.resources };
      if (input.status === "submitted") assertLessonSubmissionReady(standard);
      const documentContent = JSON.stringify({ version: 2, weekNumber: input.weekNumber, blocks: input.blocks });

      if (!input.id) {
        const id = createId();
        await tx.$executeRawUnsafe(`INSERT INTO "LessonPlan"("id","schoolId","teacherId","classId","subjectId","termId","title","objective","content","topic","subTopic","curriculumObjective","learningOutcomes","priorKnowledge","materials","introduction","development","differentiatedActivities","assessment","conclusion","homework","resources","documentContent","plannedDate","status","submittedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24::date,$25,CASE WHEN $25='submitted' THEN NOW() ELSE NULL END)`, id, session.schoolId, session.userId, input.classId, input.subjectId, input.termId, input.title, input.objective || null, summary, input.topic || null, input.subTopic || null, input.curriculumObjective || null, input.learningOutcomes || null, input.priorKnowledge || null, input.materials || null, input.introduction || null, input.development || null, input.differentiatedActivities || null, input.assessment || null, input.conclusion || null, input.homework || null, JSON.stringify(input.resources), documentContent, input.plannedDate, input.status);
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "lesson_plan.created_from_teacher_studio", entityType: "LessonPlan", entityId: id, after: { title: input.title, classId: input.classId, subjectId: input.subjectId, termId: input.termId, weekNumber: input.weekNumber, status: input.status } });
        return NextResponse.json({ ok: true, id }, { status: 201 });
      }

      if (!input.expectedUpdatedAt) throw new AppError("Refresh the lesson plan before editing it again.", 409, "EXPECTED_VERSION_REQUIRED");
      const currentRows = await tx.$queryRawUnsafe<Array<{ id: string; teacherId: string; status: string; updatedAt: Date }>>(`SELECT "id","teacherId","status","updatedAt" FROM "LessonPlan" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, input.id);
      const current = currentRows[0];
      if (!current || current.teacherId !== session.userId) throw new ForbiddenError("You can only edit lesson plans you created.");
      if (!["draft", "changes_requested"].includes(current.status)) throw new AppError("Only drafts or plans returned for changes can be edited.", 409, "WORK_NOT_EDITABLE");
      if (current.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new AppError("This lesson plan changed. Refresh before saving.", 409, "CONCURRENT_UPDATE");
      const changed = await tx.$executeRawUnsafe(`UPDATE "LessonPlan" SET "classId"=$3,"subjectId"=$4,"termId"=$5,"title"=$6,"objective"=$7,"content"=$8,"topic"=$9,"subTopic"=$10,"curriculumObjective"=$11,"learningOutcomes"=$12,"priorKnowledge"=$13,"materials"=$14,"introduction"=$15,"development"=$16,"differentiatedActivities"=$17,"assessment"=$18,"conclusion"=$19,"homework"=$20,"resources"=$21::jsonb,"documentContent"=$22::jsonb,"plannedDate"=$23::date,"status"=$24,"submittedAt"=CASE WHEN $24='submitted' THEN NOW() ELSE "submittedAt" END,"reviewerId"=CASE WHEN $24='submitted' THEN NULL ELSE "reviewerId" END,"reviewNote"=CASE WHEN $24='submitted' THEN NULL ELSE "reviewNote" END,"reviewedAt"=CASE WHEN $24='submitted' THEN NULL ELSE "reviewedAt" END,"updatedAt"=GREATEST(NOW(),"updatedAt"+INTERVAL '1 millisecond') WHERE "schoolId"=$1 AND "id"=$2 AND "updatedAt"=$25::timestamptz`, session.schoolId, input.id, input.classId, input.subjectId, input.termId, input.title, input.objective || null, summary, input.topic || null, input.subTopic || null, input.curriculumObjective || null, input.learningOutcomes || null, input.priorKnowledge || null, input.materials || null, input.introduction || null, input.development || null, input.differentiatedActivities || null, input.assessment || null, input.conclusion || null, input.homework || null, JSON.stringify(input.resources), documentContent, input.plannedDate, input.status, input.expectedUpdatedAt);
      if (changed !== 1) throw new AppError("This lesson plan changed. Refresh before saving.", 409, "CONCURRENT_UPDATE");
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "lesson_plan.updated_from_teacher_studio", entityType: "LessonPlan", entityId: input.id, before: { status: current.status }, after: { title: input.title, status: input.status, weekNumber: input.weekNumber } });
      return NextResponse.json({ ok: true, id: input.id });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_LESSON", message: "Complete the required lesson information before saving." }, { status: 400 });
    return routeError(error);
  }
}
