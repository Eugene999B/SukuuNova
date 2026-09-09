import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { ensureWorkAssessment } from "./academic-work-gradebook";
import { validateAcademicQuestions } from "./academic-work-validation";

type HomeworkDeliveryInput = {
  schoolId: string;
  actorId: string;
  academicWorkId?: string | null;
  termId?: string | null;
  classId: string;
  subjectId: string;
  title: string;
  instructions: string;
  dueDate: Date;
  points?: number | null;
};

type LinkedWork = {
  id: string;
  status: string;
  assessmentId: string | null;
  maxScore: Prisma.Decimal;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function localDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function bridgeQuestion(title: string, points: number) {
  return {
    type: "long_answer",
    prompt: `Submit your response for “${title.trim()}”.`,
    points,
    options: [] as string[],
    acceptedAnswers: [] as string[],
  };
}

async function requireBridgeTerm(tx: TenantDb, input: HomeworkDeliveryInput) {
  if (!input.termId || input.points == null) return null;
  if (!Number.isFinite(input.points) || input.points <= 0 || input.points > 10000) {
    throw new AppError("Interactive homework requires a positive points value.", 400, "INVALID_HOMEWORK_POINTS");
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`term-mutation:${input.schoolId}:${input.termId}`}))`;
  const term = await tx.term.findFirst({
    where: { id: input.termId, schoolId: input.schoolId },
    select: { id: true, startDate: true, endDate: true, isLocked: true },
  });
  if (!term) throw new AppError("Selected term was not found in this school.", 404, "TERM_NOT_FOUND");
  if (term.isLocked) throw new AppError("Selected term is locked.", 409, "TERM_LOCKED");
  if (input.dueDate < term.startDate || input.dueDate > term.endDate) {
    throw new AppError("Homework due date must fall inside the selected term.", 400, "DUE_DATE_OUTSIDE_TERM");
  }
  return term;
}

export async function ensureHomeworkAcademicDelivery(tx: TenantDb, input: HomeworkDeliveryInput) {
  if (input.academicWorkId) return input.academicWorkId;
  const term = await requireBridgeTerm(tx, input);
  if (!term || input.points == null || !input.termId) return null;

  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId: input.schoolId },
    select: { timezone: true },
  });
  const today = localDateKey(new Date(), settings?.timezone || "Africa/Accra");
  const start = dateKey(term.startDate);
  const due = dateKey(input.dueDate);
  const workDate = today < start ? start : today > due ? due : today;
  const weekNumber = Math.floor((Date.parse(`${workDate}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 604800000) + 1;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`homework-academic-sequence:${input.schoolId}:${input.classId}:${input.subjectId}:${input.termId}:${weekNumber}`}))`;
  const sequence = await tx.$queryRaw<Array<{ maximum: number }>>`
    SELECT COALESCE(MAX("workNumber"), 0)::int AS maximum
    FROM "TeacherAcademicWork"
    WHERE "schoolId"=${input.schoolId}
      AND "classId"=${input.classId}
      AND "subjectId"=${input.subjectId}
      AND "termId"=${input.termId}
      AND "weekNumber"=${weekNumber}
  `;
  const workNumber = (sequence[0]?.maximum ?? 0) + 1;
  if (workNumber > 50) throw new AppError("This class already has too many numbered activities in the selected week.", 409, "HOMEWORK_SEQUENCE_LIMIT");

  const question = bridgeQuestion(input.title, input.points);
  validateAcademicQuestions([question], input.points, "manual");
  const workId = `taw_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const questionId = `taq_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await tx.$executeRaw`
    INSERT INTO "TeacherAcademicWork"
      ("id","schoolId","termId","classId","subjectId","teacherId","kind","title","instructions","workDate","weekNumber","workNumber","maxScore","markingMode","dueAt","status")
    VALUES
      (${workId},${input.schoolId},${input.termId},${input.classId},${input.subjectId},${input.actorId},'Homework',${input.title.trim()},${input.instructions.trim()},${workDate}::date,${weekNumber},${workNumber},${input.points},'manual',${input.dueDate},'draft')
  `;
  await tx.$executeRaw`
    INSERT INTO "TeacherAcademicQuestion"
      ("id","schoolId","workId","position","type","prompt","points","options","acceptedAnswers")
    VALUES
      (${questionId},${input.schoolId},${workId},1,${question.type},${question.prompt},${question.points},'[]'::jsonb,'[]'::jsonb)
  `;
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "homework.academic_delivery_linked",
    entityType: "TeacherAcademicWork",
    entityId: workId,
    after: { classId: input.classId, subjectId: input.subjectId, termId: input.termId, title: input.title, maxScore: input.points },
  });
  return workId;
}

async function linkedWork(tx: TenantDb, schoolId: string, workId: string) {
  const rows = await tx.$queryRaw<LinkedWork[]>`
    SELECT "id","status","assessmentId","maxScore"
    FROM "TeacherAcademicWork"
    WHERE "schoolId"=${schoolId} AND "id"=${workId}
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError("The linked learner activity no longer exists.", 409, "HOMEWORK_DELIVERY_MISSING");
  return rows[0];
}

export async function syncHomeworkAcademicDelivery(tx: TenantDb, input: HomeworkDeliveryInput & { academicWorkId: string }) {
  const term = await requireBridgeTerm(tx, input);
  if (!term || input.points == null || !input.termId) {
    throw new AppError("Linked interactive homework must keep a term and positive points value.", 409, "HOMEWORK_DELIVERY_REQUIRES_TERM_POINTS");
  }
  const work = await linkedWork(tx, input.schoolId, input.academicWorkId);
  if (work.status !== "draft") throw new AppError("Published learner work cannot be edited through the homework draft editor.", 409, "HOMEWORK_DELIVERY_NOT_EDITABLE");
  if (work.assessmentId && Number(work.maxScore) !== input.points) {
    throw new AppError("The linked gradebook assessment already exists, so its maximum mark cannot be changed here.", 409, "HOMEWORK_ASSESSMENT_LINKED");
  }
  const question = bridgeQuestion(input.title, input.points);
  validateAcademicQuestions([question], input.points, "manual");
  await tx.$executeRaw`
    UPDATE "TeacherAcademicWork"
    SET "title"=${input.title.trim()},
        "instructions"=${input.instructions.trim()},
        "maxScore"=${input.points},
        "dueAt"=${input.dueDate},
        "updatedAt"=NOW()
    WHERE "schoolId"=${input.schoolId} AND "id"=${input.academicWorkId}
  `;
  const changed = await tx.$executeRaw`
    UPDATE "TeacherAcademicQuestion"
    SET "prompt"=${question.prompt}, "points"=${input.points}
    WHERE "schoolId"=${input.schoolId} AND "workId"=${input.academicWorkId} AND "position"=1 AND "type"='long_answer'
  `;
  if (changed !== 1) throw new AppError("The linked homework response question is missing or has changed.", 409, "HOMEWORK_DELIVERY_QUESTION_MISMATCH");
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "homework.academic_delivery_updated",
    entityType: "TeacherAcademicWork",
    entityId: input.academicWorkId,
    after: { title: input.title, dueDate: input.dueDate.toISOString(), maxScore: input.points },
  });
}

export async function publishHomeworkAcademicDelivery(tx: TenantDb, schoolId: string, actorId: string, workId: string) {
  const work = await linkedWork(tx, schoolId, workId);
  if (work.status === "published") return;
  if (work.status !== "draft") throw new AppError("Closed learner work cannot be republished from the homework workflow.", 409, "HOMEWORK_DELIVERY_CLOSED");
  await ensureWorkAssessment(tx, schoolId, workId, actorId);
  await tx.$executeRaw`UPDATE "TeacherAcademicWork" SET "status"='published',"publishedAt"=NOW(),"updatedAt"=NOW() WHERE "schoolId"=${schoolId} AND "id"=${workId} AND "status"='draft'`;
  await appendSchoolAudit(tx, { schoolId, actorId, action: "homework.academic_delivery_published", entityType: "TeacherAcademicWork", entityId: workId });
}

export async function closeHomeworkAcademicDelivery(tx: TenantDb, schoolId: string, actorId: string, workId: string) {
  const work = await linkedWork(tx, schoolId, workId);
  if (work.status === "closed") return;
  if (work.status !== "published") throw new AppError("Only published learner work can be closed.", 409, "HOMEWORK_DELIVERY_NOT_PUBLISHED");
  await tx.$executeRaw`UPDATE "TeacherAcademicWork" SET "status"='closed',"updatedAt"=NOW() WHERE "schoolId"=${schoolId} AND "id"=${workId} AND "status"='published'`;
  await appendSchoolAudit(tx, { schoolId, actorId, action: "homework.academic_delivery_closed", entityType: "TeacherAcademicWork", entityId: workId });
}
