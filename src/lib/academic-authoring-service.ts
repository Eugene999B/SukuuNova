import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TenantDb } from "./db";
import { requirePermission } from "./rbac";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import {
  ensureHomeworkAcademicDelivery,
  publishHomeworkAcademicDelivery,
  syncHomeworkAcademicDelivery,
} from "./homework-academic-bridge";

const identity = { id: z.string().min(1).max(100), expectedUpdatedAt: z.string().datetime(), title: z.string().trim().min(3).max(160) };
export const lessonEditSchema = z.object({
  ...identity, objective: z.string().trim().max(500).optional(),
  content: z.string().trim().min(10).max(12000), plannedDate: z.coerce.date(),
  status: z.enum(["draft", "submitted"])
});
export const homeworkEditSchema = z.object({
  ...identity, instructions: z.string().trim().min(5).max(12000),
  dueDate: z.coerce.date(), points: z.number().finite().min(1).max(10000).nullable().optional(),
  assignmentStatus: z.enum(["draft", "assigned"])
});
type Actor = { schoolId: string; actorId: string };
type Work = { id: string; teacherId: string; classId: string; subjectId: string; termId: string | null; status: string; updatedAt: Date; title: string };

async function editableWork(tx: TenantDb, actor: Actor, kind: "lesson" | "homework", id: string, expectedUpdatedAt: string, date: Date) {
  await requirePermission(tx, actor.actorId, kind === "lesson" ? "lesson_plans:manage" : "homework:manage_assigned");
  const table = kind === "lesson" ? Prisma.sql`"LessonPlan"` : Prisma.sql`"Homework"`;
  const status = kind === "lesson" ? Prisma.sql`"status"` : Prisma.sql`"assignmentStatus"`;
  const seeds = await tx.$queryRaw<Array<{ termId: string | null }>>`SELECT "termId" FROM ${table} WHERE "id"=${id} AND "schoolId"=${actor.schoolId}`;
  if (!seeds[0]) throw new AppError("Academic work not found in this school.", 404, "NOT_FOUND");
  // Match the workflow and term-lock ordering used by the status endpoints.
  if (seeds[0].termId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"term-mutation:" + actor.schoolId + ":" + seeds[0].termId}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${(kind === "lesson" ? "lesson-plan-workflow:" : "homework-workflow:") + actor.schoolId + ":" + id}))`;
  const rows = await tx.$queryRaw<Work[]>`SELECT "id","teacherId","classId","subjectId","termId",${status} AS "status","updatedAt","title" FROM ${table} WHERE "id"=${id} AND "schoolId"=${actor.schoolId}`;
  const current = rows[0];
  if (!current) throw new AppError("Academic work not found in this school.", 404, "NOT_FOUND");
  if (current.teacherId !== actor.actorId) throw new ForbiddenError("Only the author can edit this work.");
  if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) throw new AppError("This work changed. Refresh before editing again.", 409, "CONCURRENT_UPDATE");
  const editable = kind === "lesson" ? ["draft", "changes_requested"] : ["draft"];
  if (!editable.includes(current.status)) throw new AppError("Only drafts or lesson plans returned for revision can be edited.", 409, "WORK_NOT_EDITABLE");
  const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId: actor.schoolId, teacherId: actor.actorId, classId: current.classId, subjectId: current.subjectId } });
  const formClass = await tx.class.findFirst({ where: { schoolId: actor.schoolId, id: current.classId, classTeacherId: actor.actorId }, select: { id: true } });
  if (!assignment && !formClass) throw new ForbiddenError("You are no longer assigned to teach this class and subject.");
  if (current.termId) {
    const term = await tx.term.findFirst({ where: { schoolId: actor.schoolId, id: current.termId } });
    if (!term) throw new AppError("Term not found.", 404, "TERM_NOT_FOUND");
    if (term.isLocked) throw new AppError("This term is locked.", 409, "TERM_LOCKED");
    if (date < term.startDate || date > term.endDate) throw new AppError("The date must fall inside the selected term.", 400, "DATE_OUTSIDE_TERM");
  }
  return current;
}

export async function editLessonPlan(tx: TenantDb, actor: Actor, input: z.infer<typeof lessonEditSchema>) {
  const current = await editableWork(tx, actor, "lesson", input.id, input.expectedUpdatedAt, input.plannedDate);
  const changed = await tx.$executeRaw`UPDATE "LessonPlan" SET "title"=${input.title},"objective"=${input.objective ?? null},"content"=${input.content},"plannedDate"=${input.plannedDate},"status"=${input.status},"updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt" + INTERVAL '1 millisecond') WHERE "id"=${input.id} AND "schoolId"=${actor.schoolId} AND "updatedAt"=${current.updatedAt}`;
  if (changed !== 1) throw new AppError("This work changed. Refresh before editing again.", 409, "CONCURRENT_UPDATE");
  await appendSchoolAudit(tx, { ...actor, action: "lesson_plan.content_updated", entityType: "LessonPlan", entityId: input.id, before: { title: current.title, status: current.status }, after: { title: input.title, status: input.status } });
  return { ok: true };
}

export async function editHomework(tx: TenantDb, actor: Actor, input: z.infer<typeof homeworkEditSchema>) {
  const current = await editableWork(tx, actor, "homework", input.id, input.expectedUpdatedAt, input.dueDate);
  const linkRows = await tx.$queryRaw<Array<{ academicWorkId: string | null }>>`
    SELECT "academicWorkId" FROM "Homework" WHERE "id"=${input.id} AND "schoolId"=${actor.schoolId} LIMIT 1
  `;
  let academicWorkId = linkRows[0]?.academicWorkId ?? null;
  const points = input.points ?? null;

  if (!academicWorkId && current.termId && points != null) {
    academicWorkId = await ensureHomeworkAcademicDelivery(tx, {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      termId: current.termId,
      classId: current.classId,
      subjectId: current.subjectId,
      title: input.title,
      instructions: input.instructions,
      dueDate: input.dueDate,
      points,
    });
  }
  if (academicWorkId) {
    if (points == null) throw new AppError("Interactive homework must keep a positive points value.", 409, "HOMEWORK_DELIVERY_REQUIRES_POINTS");
    await syncHomeworkAcademicDelivery(tx, {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      academicWorkId,
      termId: current.termId,
      classId: current.classId,
      subjectId: current.subjectId,
      title: input.title,
      instructions: input.instructions,
      dueDate: input.dueDate,
      points,
    });
  }
  if (input.assignmentStatus === "assigned") {
    if (!academicWorkId) {
      throw new AppError("Choose a term and points before assigning homework so learners receive a real submission activity.", 409, "HOMEWORK_DELIVERY_REQUIRES_TERM_POINTS");
    }
    await publishHomeworkAcademicDelivery(tx, actor.schoolId, actor.actorId, academicWorkId);
  }

  const changed = await tx.$executeRaw`
    UPDATE "Homework"
    SET "title"=${input.title},
        "instructions"=${input.instructions},
        "dueDate"=${input.dueDate},
        "points"=${points},
        "assignmentStatus"=${input.assignmentStatus},
        "academicWorkId"=COALESCE(${academicWorkId},"academicWorkId"),
        "reviewStatus"='not_reviewed',
        "reviewerId"=NULL,
        "reviewedAt"=NULL,
        "updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt" + INTERVAL '1 millisecond')
    WHERE "id"=${input.id} AND "schoolId"=${actor.schoolId} AND "updatedAt"=${current.updatedAt}
  `;
  if (changed !== 1) throw new AppError("This work changed. Refresh before editing again.", 409, "CONCURRENT_UPDATE");
  await appendSchoolAudit(tx, {
    ...actor,
    action: "homework.content_updated",
    entityType: "Homework",
    entityId: input.id,
    before: { title: current.title, assignmentStatus: current.status },
    after: { title: input.title, assignmentStatus: input.assignmentStatus, academicWorkId },
  });
  return { ok: true, academicWorkId };
}
