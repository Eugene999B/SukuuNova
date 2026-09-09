import { gradebookChangesSchema, type GradebookChange } from "./gradebook-input";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { hasPermission } from "./rbac";

async function lockTerm(tx: TenantDb, schoolId: string, termId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`term-mutation:${schoolId}:${termId}`}))`;
  const term = await tx.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, isLocked: true, name: true } });
  if (!term) throw new AppError("The selected term does not belong to this school.", 400, "INVALID_TERM");
  if (term.isLocked) throw new AppError(`Term "${term.name}" is locked. Academic records can no longer be changed.`, 409, "TERM_LOCKED");
  return term;
}

async function assertScoreMutable(tx: TenantDb, schoolId: string, studentId: string, termId: string) {
  const report = await tx.reportCard.findFirst({ where: { schoolId, studentId, termId }, select: { id: true, status: true } });
  if (report && (report.status === "approved" || report.status === "sent")) throw new AppError("This report card is finalized. Scores cannot be changed without reopening it.", 409, "REPORT_FINALIZED");
}

function canTeach(assignment: { teacherId: string } | null, classTeacher: { id: string } | null): boolean { return !!assignment || !!classTeacher; }

export async function createAssessment(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string; classId: string; subjectId: string; name: string; type: string; weight: number; maxScore: number; }) {
  const canWriteAll = await hasPermission(tx, input.actorId, "scores:write:all");
  if (!canWriteAll && !(await hasPermission(tx, input.actorId, "scores:write:assigned"))) throw new ForbiddenError("Assessment creation is not permitted.");
  await lockTerm(tx, input.schoolId, input.termId);
  if (!canWriteAll) {
    const [assignment, classTeacher] = await Promise.all([
      tx.classSubjectTeacher.findFirst({ where: { schoolId: input.schoolId, classId: input.classId, subjectId: input.subjectId, teacherId: input.actorId }, select: { teacherId: true } }),
      tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId, classTeacherId: input.actorId }, select: { id: true } })
    ]);
    if (!canTeach(assignment, classTeacher)) throw new ForbiddenError("Teachers may create assessments only for classes and subjects they teach (including form classes).");
  }
  if (!input.name.trim()) throw new AppError("Assessment name is required.", 400, "INVALID_ASSESSMENT");
  if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 100 || !Number.isFinite(input.maxScore) || input.maxScore <= 0) throw new AppError("Assessment weight and maximum score must be valid positive values.", 400, "INVALID_ASSESSMENT");
  const [term, schoolClass, subject] = await Promise.all([
    tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true } }),
    tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true, name: true } }),
    tx.subject.findFirst({ where: { id: input.subjectId, schoolId: input.schoolId }, select: { id: true, name: true } })
  ]);
  if (!term || !schoolClass || !subject) throw new AppError("The selected term, class or subject does not belong to this school.", 400, "INVALID_CONTEXT");
  const finalizedCount = await tx.reportCard.count({ where: { schoolId: input.schoolId, termId: input.termId, status: { in: ["approved", "sent"] }, student: { classId: input.classId } } });
  if (finalizedCount > 0) throw new AppError("This class already has finalized report cards for the term. New assessments cannot be added without reopening them.", 409, "REPORT_FINALIZED");
  const assessment = await tx.assessment.create({ data: { schoolId: input.schoolId, termId: input.termId, classId: input.classId, subjectId: input.subjectId, name: input.name.trim(), type: input.type.trim(), weight: new Prisma.Decimal(input.weight), maxScore: new Prisma.Decimal(input.maxScore) } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "assessment.created", entityType: "Assessment", entityId: assessment.id, after: assessment });
  return assessment;
}

export type ScoreExpectation = { id: string; value: number; status: string; enteredAt: string } | null;

export async function enterScore(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; assessmentId: string; value: number; status?: "present" | "absent" | "excused"; expected?: ScoreExpectation; }) {
  const assessment = await tx.assessment.findFirst({ where: { id: input.assessmentId, schoolId: input.schoolId }, select: { id: true, classId: true, subjectId: true, termId: true, maxScore: true } });
  if (!assessment) throw new AppError("Assessment not found in this school.", 404, "NOT_FOUND");
  const canWriteAll = await hasPermission(tx, input.actorId, "scores:write:all");
  const canWriteAssigned = await hasPermission(tx, input.actorId, "scores:write:assigned");
  if (!canWriteAll && !canWriteAssigned) throw new ForbiddenError("Score entry is not permitted.");
  if (!canWriteAll) {
    const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId: input.schoolId, classId: assessment.classId, subjectId: assessment.subjectId, teacherId: input.actorId }, select: { teacherId: true } });
    const classTeacher = await tx.class.findFirst({ where: { id: assessment.classId, schoolId: input.schoolId, classTeacherId: input.actorId }, select: { id: true } });
    if (!assignment && !classTeacher) throw new ForbiddenError("Teachers may enter scores only for assigned classes and subjects.");
  }
  await lockTerm(tx, input.schoolId, assessment.termId);
  await assertScoreMutable(tx, input.schoolId, input.studentId, assessment.termId);
  const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true, classId: true } });
  if (!student || student.classId !== assessment.classId) throw new AppError("The student is not in the assessment class.", 400, "INVALID_STUDENT_CLASS");
  if (!Number.isFinite(input.value) || input.value < 0 || new Prisma.Decimal(input.value).greaterThan(assessment.maxScore)) throw new AppError("Score is outside the assessment range.", 400, "INVALID_SCORE");
  const status = input.status ?? "present";
  if (!["present", "absent", "excused"].includes(status) || (status !== "present" && input.value !== 0)) throw new AppError("Absent and excused marks must be zero.", 400, "INVALID_SCORE");
  const previous = await tx.score.findUnique({ where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } } });
  assertScoreExpectation(previous, input.expected);
  const score = await tx.score.upsert({ where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } }, update: { value: new Prisma.Decimal(input.value), status, enteredBy: input.actorId, enteredAt: new Date() }, create: { schoolId: input.schoolId, studentId: input.studentId, subjectId: assessment.subjectId, assessmentId: assessment.id, value: new Prisma.Decimal(input.value), status, enteredBy: input.actorId } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: previous ? "score.updated" : "score.created", entityType: "Score", entityId: score.id, before: previous, after: score });
  return score;
}

export async function clearScore(tx: TenantDb, input: { schoolId: string; actorId: string; studentId: string; assessmentId: string; expected?: ScoreExpectation; }) {
  const assessment = await tx.assessment.findFirst({ where: { id: input.assessmentId, schoolId: input.schoolId }, select: { id: true, classId: true, subjectId: true, termId: true } });
  if (!assessment) throw new AppError("Assessment not found in this school.", 404, "NOT_FOUND");
  const canWriteAll = await hasPermission(tx, input.actorId, "scores:write:all");
  if (!canWriteAll) {
    const canWriteAssigned = await hasPermission(tx, input.actorId, "scores:write:assigned");
    if (!canWriteAssigned) throw new ForbiddenError("Score entry is not permitted.");
    const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId: input.schoolId, classId: assessment.classId, subjectId: assessment.subjectId, teacherId: input.actorId }, select: { teacherId: true } });
    const classTeacher = await tx.class.findFirst({ where: { id: assessment.classId, schoolId: input.schoolId, classTeacherId: input.actorId }, select: { id: true } });
    if (!assignment && !classTeacher) throw new ForbiddenError("Teachers may clear scores only for assigned classes and subjects.");
  }
  await lockTerm(tx, input.schoolId, assessment.termId);
  await assertScoreMutable(tx, input.schoolId, input.studentId, assessment.termId);
  const previous = await tx.score.findUnique({ where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } } });
  assertScoreExpectation(previous, input.expected);
  if (!previous && input.expected === null) return { cleared: true };
  if (!previous) throw new AppError("No score recorded for this student and assessment.", 404, "NOT_FOUND");
  await tx.score.delete({ where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "score.cleared", entityType: "Score", entityId: previous.id, before: previous });
  return { cleared: true };
}

function assertScoreExpectation(previous: { id: string; value: Prisma.Decimal; status: string; enteredAt: Date } | null, expected: ScoreExpectation | undefined) {
  if (expected === undefined) return;
  const matches = expected === null ? !previous : !!previous && previous.id === expected.id && Number(previous.value) === expected.value && previous.status === expected.status && previous.enteredAt.toISOString() === expected.enteredAt;
  if (!matches) throw new AppError("A mark changed after you opened this sheet. Reload the latest marks and reapply your edits. Nothing in this batch was saved.", 409, "SCORE_CONFLICT");
}

/** Caller supplies one withTenant transaction, so any rejected cell rolls back the entire sheet. */
export async function saveGradebookChanges(tx: TenantDb, input: { schoolId: string; actorId: string; changes: GradebookChange[] }) {
  const changes = gradebookChangesSchema.parse(input.changes);
  const assessmentIds = [...new Set(changes.map(change => change.assessmentId))];
  const assessments = await tx.assessment.findMany({ where: { schoolId: input.schoolId, id: { in: assessmentIds } }, select: { id: true, termId: true, classId: true, subjectId: true } });
  if (assessments.length !== assessmentIds.length) throw new AppError("An assessment no longer exists in this school.", 404, "NOT_FOUND");
  if (new Set(assessments.map(item => item.termId + ":" + item.classId + ":" + item.subjectId)).size !== 1) throw new AppError("Save one class, subject and term at a time.", 400, "INVALID_CONTEXT");
  const results = [];
  for (const change of changes) {
    const common = { schoolId: input.schoolId, actorId: input.actorId, ...change };
    if (change.action === "clearScore") {
      await clearScore(tx, common);
      results.push({ studentId: change.studentId, assessmentId: change.assessmentId, expected: null });
    } else {
      const score = await enterScore(tx, { ...common, value: change.value, status: change.status });
      results.push({ studentId: change.studentId, assessmentId: change.assessmentId, expected: { id: score.id, value: Number(score.value), status: score.status, enteredAt: score.enteredAt.toISOString() } });
    }
  }
  return results;
}
