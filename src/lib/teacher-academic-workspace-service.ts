import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { hasPermission } from "./rbac";

const WORK_KINDS = ["Classwork", "Homework", "Exercise", "Participation", "Quiz", "Exam"] as const;
type WorkKind = typeof WORK_KINDS[number];
type MarkMode = "manual" | "auto" | "review";

async function assertTeacherCanUseContext(tx: TenantDb, schoolId: string, teacherId: string, classId: string, subjectId: string) {
  const canAll = await hasPermission(tx, teacherId, "scores:write:all");
  if (canAll) return;
  const [assignment, classTeacher] = await Promise.all([
    tx.classSubjectTeacher.findFirst({ where: { schoolId, teacherId, classId, subjectId }, select: { teacherId: true } }),
    tx.class.findFirst({ where: { schoolId, id: classId, classTeacherId: teacherId }, select: { id: true } }),
  ]);
  if (!assignment && !classTeacher) throw new ForbiddenError("You can only work with classes and subjects assigned to you.");
}

async function assertTermOpen(tx: TenantDb, schoolId: string, termId: string) {
  const term = await tx.term.findFirst({ where: { schoolId, id: termId }, select: { id: true, name: true, isLocked: true } });
  if (!term) throw new AppError("The selected term is not available in this school.", 400, "INVALID_TERM");
  if (term.isLocked) throw new AppError(`Term "${term.name}" is locked.", 409, "TERM_LOCKED");
  return term;
}

export async function getTeacherAcademicContexts(tx: TenantDb, schoolId: string, teacherId: string) {
  const [assignments, terms] = await Promise.all([
    tx.classSubjectTeacher.findMany({
      where: { schoolId, teacherId },
      include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } } },
      orderBy: [{ classId: "asc" }, { subjectId: "asc" }],
    }),
    tx.term.findMany({ where: { schoolId }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { assignments, terms };
}

export async function getTeacherAcademicRoster(tx: TenantDb, input: { schoolId: string; teacherId: string; classId: string; subjectId: string; termId: string }) {
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, input.classId, input.subjectId);
  await assertTermOpen(tx, input.schoolId, input.termId);
  const [students, works, assessments, notes] = await Promise.all([
    tx.student.findMany({ where: { schoolId: input.schoolId, classId: input.classId, status: "active" }, select: { id: true, name: true, admissionNo: true }, orderBy: { name: "asc" } }),
    tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT id,"title","kind","workDate","weekNumber","workNumber","maxScore","markingMode","status","dueAt" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "classId"=$2 AND "subjectId"=$3 AND "termId"=$4 ORDER BY "workDate" DESC,"workNumber" ASC`, input.schoolId, input.classId, input.subjectId, input.termId),
    tx.assessment.findMany({ where: { schoolId: input.schoolId, classId: input.classId, subjectId: input.subjectId, termId: input.termId }, select: { id: true, name: true, type: true, maxScore: true, weight: true, scores: { select: { studentId: true, value: true, status: true } } }, orderBy: { name: "asc" } }),
    tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT id,"title","weekNumber","status","publishedAt","content" FROM "TeacherAcademicNote" WHERE "schoolId"=$1 AND "classId"=$2 AND "subjectId"=$3 AND "termId"=$4 ORDER BY "updatedAt" DESC`, input.schoolId, input.classId, input.subjectId, input.termId),
  ]);
  return { students, works, assessments, notes };
}

export async function createTeacherAcademicWork(tx: TenantDb, input: {
  schoolId: string; teacherId: string; termId: string; classId: string; subjectId: string;
  kind: WorkKind; title: string; instructions?: string; workDate: string; weekNumber: number; workNumber: number;
  maxScore: number; markingMode: MarkMode; dueAt?: string | null; answerGuide?: unknown; questionList?: Array<{ type: string; prompt: string; points: number; options?: string[]; acceptedAnswers?: string[] }>;
}) {
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, input.classId, input.subjectId);
  await assertTermOpen(tx, input.schoolId, input.termId);
  if (!WORK_KINDS.includes(input.kind)) throw new AppError("Unsupported work type.", 400, "INVALID_WORK_KIND");
  if (!input.title.trim()) throw new AppError("A title is required.", 400, "INVALID_WORK");
  if (!Number.isFinite(input.weekNumber) || input.weekNumber < 1 || input.weekNumber > 60) throw new AppError("Week must be between 1 and 60.", 400, "INVALID_WEEK");
  if (!Number.isInteger(input.workNumber) || input.workNumber < 1 || input.workNumber > 50) throw new AppError("Work number must be between 1 and 50.", 400, "INVALID_WORK_NUMBER");
  if (!Number.isFinite(input.maxScore) || input.maxScore <= 0 || input.maxScore > 100000) throw new AppError("Maximum mark must be positive.", 400, "INVALID_MAX_SCORE");
  const id = `taw_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicWork"("id","schoolId","termId","classId","subjectId","teacherId","kind","title","instructions","workDate","weekNumber","workNumber","maxScore","markingMode","answerGuide","dueAt","status") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15::jsonb,$16::timestamptz,'draft')`, id, input.schoolId, input.termId, input.classId, input.subjectId, input.teacherId, input.kind, input.title.trim(), input.instructions?.trim() || null, input.workDate, input.weekNumber, input.workNumber, input.maxScore, input.markingMode, JSON.stringify(input.answerGuide ?? null), input.dueAt ?? null);
  for (let i = 0; i < (input.questionList ?? []).length; i += 1) {
    const q = input.questionList![i];
    const qId = `taq_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicQuestion"("id","schoolId","workId","position","type","prompt","points","options","acceptedAnswers") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, qId, input.schoolId, id, i + 1, q.type.slice(0, 40), q.prompt.trim().slice(0, 4000), q.points, JSON.stringify(q.options ?? []), JSON.stringify(q.acceptedAnswers ?? []));
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "academic_work.created", entityType: "TeacherAcademicWork", entityId: id, after: { ...input, id } });
  return { id };
}

export async function publishTeacherAcademicWork(tx: TenantDb, input: { schoolId: string; teacherId: string; workId: string }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; classId: string; subjectId: string; status: string }>>(`SELECT id,"classId","subjectId","status" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.workId, input.schoolId);
  const work = rows[0];
  if (!work) throw new AppError("Work not found.", 404, "NOT_FOUND");
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, work.classId, work.subjectId);
  if (work.status === "published") return work;
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicWork" SET "status"='published',"publishedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1 AND "schoolId"=$2`, input.workId, input.schoolId);
  return { ...work, status: "published" };
}

async function findOrCreateAssessment(tx: TenantDb, input: { schoolId: string; teacherId: string; termId: string; classId: string; subjectId: string; title: string; kind: string; maxScore: number }) {
  const existing = await tx.assessment.findFirst({ where: { schoolId: input.schoolId, termId: input.termId, classId: input.classId, subjectId: input.subjectId, name: input.title }, select: { id: true, maxScore: true } });
  if (existing) return existing;
  const assessment = await tx.assessment.create({ data: { schoolId: input.schoolId, termId: input.termId, classId: input.classId, subjectId: input.subjectId, name: input.title, type: input.kind, weight: new Prisma.Decimal(100), maxScore: new Prisma.Decimal(input.maxScore) } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "assessment.created_from_academic_work", entityType: "Assessment", entityId: assessment.id, after: assessment });
  return assessment;
}

export async function saveTeacherWorkMarks(tx: TenantDb, input: { schoolId: string; teacherId: string; workId: string; marks: Array<{ studentId: string; value: number; status?: "present" | "absent" | "excused" }> }) {
  const workRows = await tx.$queryRawUnsafe<Array<{ id: string; termId: string; classId: string; subjectId: string; title: string; kind: string; maxScore: Prisma.Decimal }>>(`SELECT id,"termId","classId","subjectId","title","kind","maxScore" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.workId, input.schoolId);
  const work = workRows[0];
  if (!work) throw new AppError("Work not found.", 404, "NOT_FOUND");
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, work.classId, work.subjectId);
  await assertTermOpen(tx, input.schoolId, work.termId);
  const assessment = await findOrCreateAssessment(tx, { ...input, termId: work.termId, classId: work.classId, subjectId: work.subjectId, title: work.title, kind: work.kind, maxScore: Number(work.maxScore) });
  let saved = 0;
  for (const mark of input.marks) {
    const student = await tx.student.findFirst({ where: { schoolId: input.schoolId, id: mark.studentId, classId: work.classId }, select: { id: true } });
    if (!student) throw new AppError("A selected student is not in this class.", 400, "INVALID_STUDENT");
    if (!Number.isFinite(mark.value) || mark.value < 0 || new Prisma.Decimal(mark.value).greaterThan(assessment.maxScore)) throw new AppError(`Mark must be from 0 to ${assessment.maxScore.toString()}.", 400, "INVALID_SCORE");
    await tx.score.upsert({ where: { studentId_assessmentId: { studentId: mark.studentId, assessmentId: assessment.id } }, update: { value: new Prisma.Decimal(mark.value), status: mark.status ?? "present", enteredBy: input.teacherId, enteredAt: new Date() }, create: { schoolId: input.schoolId, studentId: mark.studentId, subjectId: work.subjectId, assessmentId: assessment.id, value: new Prisma.Decimal(mark.value), status: mark.status ?? "present", enteredBy: input.teacherId } });
    saved += 1;
  }
  return { saved, assessmentId: assessment.id };
}

export async function createTeacherAcademicNote(tx: TenantDb, input: { schoolId: string; teacherId: string; termId: string; classId: string; subjectId: string; title: string; content: unknown; weekNumber?: number }) {
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, input.classId, input.subjectId);
  await assertTermOpen(tx, input.schoolId, input.termId);
  if (!input.title.trim()) throw new AppError("Note title is required.", 400, "INVALID_NOTE");
  const id = `tan_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicNote"("id","schoolId","termId","classId","subjectId","teacherId","title","content","weekNumber","status") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'draft')`, id, input.schoolId, input.termId, input.classId, input.subjectId, input.teacherId, input.title.trim(), JSON.stringify(input.content ?? { blocks: [] }), input.weekNumber ?? null);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "academic_note.created", entityType: "TeacherAcademicNote", entityId: id, after: { title: input.title, classId: input.classId, subjectId: input.subjectId, weekNumber: input.weekNumber ?? null } });
  return { id };
}

export async function publishTeacherAcademicNote(tx: TenantDb, input: { schoolId: string; teacherId: string; noteId: string }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; classId: string; subjectId: string; status: string }>>(`SELECT id,"classId","subjectId","status" FROM "TeacherAcademicNote" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.noteId, input.schoolId);
  const note = rows[0];
  if (!note) throw new AppError("Note not found.", 404, "NOT_FOUND");
  await assertTeacherCanUseContext(tx, input.schoolId, input.teacherId, note.classId, note.subjectId);
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicNote" SET "status"='published',"publishedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1 AND "schoolId"=$2`, input.noteId, input.schoolId);
  return { ...note, status: "published" };
}
