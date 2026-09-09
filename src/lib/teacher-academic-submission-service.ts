import { ensureWorkAssessment } from "./academic-work-gradebook";
import { gradeAcademicQuestions } from "./academic-question-grading";
import { hasPermission } from "./rbac";
import { enterScore, type ScoreExpectation } from "./gradebook-service";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";

type AttemptPolicy = "highest" | "latest";
type WorkRow = {
  id: string; schoolId: string; termId: string; classId: string; subjectId: string; teacherId: string;
  title: string; kind: string; instructions: string | null; maxScore: Prisma.Decimal;
  answerGuide: unknown; markingMode: string; dueAt: Date | null; status: string;
  weekNumber: number; workNumber: number; workDate: Date; attemptLimit: number; attemptScorePolicy: AttemptPolicy;
};
type QuestionRow = {
  id: string; position: number; type: string; prompt: string; points: Prisma.Decimal;
  options: unknown; acceptedAnswers: unknown;
};
type SubmissionRow = {
  id: string; startedAt: Date | null; submittedAt: Date | null; status: string;
  totalAwarded: Prisma.Decimal | null; reviewedBy: string | null; reviewedAt: Date | null;
  reviewNotes: string | null; attemptNumber: number;
};
type AnswerInput = { responseText?: string | null; responseData?: unknown };
type GradebookGuard = { safe: boolean; expected: ScoreExpectation; baseline: number | null; currentValue: number | null };

async function getWork(tx: TenantDb, schoolId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<WorkRow[]>(`SELECT "id","schoolId","termId","classId","subjectId","teacherId","title","kind","instructions","maxScore","markingMode","answerGuide","dueAt","status","weekNumber","workNumber","workDate","attemptLimit","attemptScorePolicy" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, workId, schoolId);
  const work = rows[0];
  if (!work) throw new AppError("Academic work was not found.", 404, "NOT_FOUND");
  if (work.status !== "published") throw new AppError("This activity is not currently published.", 409, "WORK_NOT_PUBLISHED");
  return work;
}

async function assertLinkedStudent(tx: TenantDb, schoolId: string, guardianId: string, studentId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; classId: string | null }>>(`SELECT s."id",s."classId" FROM "Student" s INNER JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" WHERE sg."schoolId"=$1 AND sg."guardianId"=$2 AND s."id"=$3 AND s."status"='active' LIMIT 1`, schoolId, guardianId, studentId);
  const student = rows[0];
  if (!student) throw new ForbiddenError("You can only access academic work belonging to a linked child.");
  return student;
}

export async function getGuardianAcademicOverview(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId?: string; subjectId?: string }) {
  const students = await tx.$queryRawUnsafe<Array<{ id: string; name: string; admissionNo: string; classId: string | null; className: string | null }>>(`SELECT s."id",s."name",s."admissionNo",s."classId",c."name" AS "className" FROM "Student" s INNER JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" WHERE sg."schoolId"=$1 AND sg."guardianId"=$2 AND s."status"='active' ORDER BY s."name" ASC`, input.schoolId, input.guardianId);
  const selected = input.studentId ? students.find((student) => student.id === input.studentId) : students[0];
  if (input.studentId && !selected) throw new ForbiddenError("You can only access academic work belonging to a linked child.");
  if (!selected) return { students, selectedStudent: null, subjects: [], works: [], notes: [] };
  await assertLinkedStudent(tx, input.schoolId, input.guardianId, selected.id);
  const subjects = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(`SELECT sub."id",sub."name" FROM "Subject" sub WHERE sub."schoolId"=$1 AND (EXISTS (SELECT 1 FROM "TeacherAcademicWork" w WHERE w."schoolId"=sub."schoolId" AND w."subjectId"=sub."id" AND w."classId"=$2 AND w."status"='published') OR EXISTS (SELECT 1 FROM "TeacherAcademicNote" n WHERE n."schoolId"=sub."schoolId" AND n."subjectId"=sub."id" AND n."classId"=$2 AND n."status"='published')) ORDER BY sub."name" ASC`, input.schoolId, selected.classId);
  const filter = input.subjectId ? ` AND w."subjectId"=$3` : "";
  const params: unknown[] = input.subjectId ? [input.schoolId, selected.classId, input.subjectId] : [input.schoolId, selected.classId];
  const studentParam = params.length + 1;
  const works = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT w."id",w."termId",w."classId",w."subjectId",w."kind",w."title",w."instructions",w."workDate",w."weekNumber",w."workNumber",w."maxScore",w."markingMode",w."dueAt",w."status",w."attemptLimit",w."attemptScorePolicy",sub."name" AS "subjectName",COALESCE(ts."status",'not_started') AS "submissionStatus",CASE WHEN ts."status"='graded' THEN ts."totalAwarded" ELSE NULL END AS "totalAwarded",COALESCE(ts."attemptNumber",0) AS "currentAttempt",policy."totalAwarded" AS "recordedScore" FROM "TeacherAcademicWork" w INNER JOIN "Subject" sub ON sub."id"=w."subjectId" AND sub."schoolId"=w."schoolId" LEFT JOIN LATERAL (SELECT s0."status",s0."totalAwarded",s0."attemptNumber" FROM "TeacherAcademicSubmission" s0 WHERE s0."schoolId"=w."schoolId" AND s0."workId"=w."id" AND s0."studentId"=$${studentParam} ORDER BY s0."attemptNumber" DESC LIMIT 1) ts ON TRUE LEFT JOIN LATERAL (SELECT s1."totalAwarded" FROM "TeacherAcademicSubmission" s1 WHERE s1."schoolId"=w."schoolId" AND s1."workId"=w."id" AND s1."studentId"=$${studentParam} AND s1."status"='graded' AND s1."totalAwarded" IS NOT NULL ORDER BY CASE WHEN w."attemptScorePolicy"='latest' THEN s1."attemptNumber" END DESC,CASE WHEN w."attemptScorePolicy"='highest' THEN s1."totalAwarded" END DESC,s1."attemptNumber" DESC LIMIT 1) policy ON TRUE WHERE w."schoolId"=$1 AND w."classId"=$2${filter} AND w."status"='published' ORDER BY w."workDate" DESC,w."workNumber" ASC`, ...params, selected.id);
  const notes = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT n."id",n."title",n."weekNumber",n."publishedAt",n."content",sub."name" AS "subjectName" FROM "TeacherAcademicNote" n INNER JOIN "Subject" sub ON sub."id"=n."subjectId" AND sub."schoolId"=n."schoolId" WHERE n."schoolId"=$1 AND n."classId"=$2 AND n."status"='published'${input.subjectId ? ` AND n."subjectId"=$3` : ""} ORDER BY n."publishedAt" DESC NULLS LAST,n."updatedAt" DESC`, ...params);
  return { students, selectedStudent: selected, subjects, works, notes };
}

async function loadLatestSubmission(tx: TenantDb, schoolId: string, studentId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<SubmissionRow[]>(`SELECT "id","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 ORDER BY "attemptNumber" DESC LIMIT 1`, schoolId, workId, studentId);
  return rows[0];
}

async function loadSubmissionAttempt(tx: TenantDb, schoolId: string, studentId: string, workId: string, attemptNumber: number) {
  const rows = await tx.$queryRawUnsafe<SubmissionRow[]>(`SELECT "id","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 AND "attemptNumber"=$4 LIMIT 1`, schoolId, workId, studentId, attemptNumber);
  return rows[0];
}

async function listAttemptSummaries(tx: TenantDb, schoolId: string, studentId: string, workId: string) {
  return tx.$queryRawUnsafe<SubmissionRow[]>(`SELECT "id","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 ORDER BY "attemptNumber" DESC`, schoolId, workId, studentId);
}

async function lockSubmission(tx: TenantDb, schoolId: string, workId: string, studentId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ termId: string }>>('SELECT "termId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2', schoolId, workId);
  if (!rows[0]) throw new AppError("Academic work was not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"term-mutation:" + schoolId + ":" + rows[0].termId}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"academic-submission:" + schoolId + ":" + workId + ":" + studentId}))`;
}

async function requireOpenWorkTerm(tx: TenantDb, schoolId: string, termId: string) {
  const term = await tx.term.findFirst({ where: { id: termId, schoolId }, select: { isLocked: true } });
  if (!term || term.isLocked) throw new AppError("The academic term is locked or unavailable.", 409, "TERM_LOCKED");
}

function ensureWindowOpen(work: WorkRow, message: string) {
  if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError(message, 409, "WORK_EXPIRED");
}

async function buildGuardianActivity(tx: TenantDb, input: { schoolId: string; studentId: string }, work: WorkRow, submission: SubmissionRow) {
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const answers = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "questionId","responseText","responseData","awardedScore","markingMode","markerComment" FROM "TeacherAcademicAnswer" WHERE "schoolId"=$1 AND "submissionId"=$2 ORDER BY "questionId"`, input.schoolId, submission.id);
  const attempts = await listAttemptSummaries(tx, input.schoolId, input.studentId, work.id);
  const latest = attempts[0];
  const publicWork = { weekNumber: work.weekNumber, workNumber: work.workNumber, workDate: work.workDate, id: work.id, schoolId: work.schoolId, termId: work.termId, classId: work.classId, subjectId: work.subjectId, title: work.title, kind: work.kind, instructions: work.instructions, maxScore: work.maxScore, markingMode: work.markingMode, dueAt: work.dueAt, status: work.status, attemptLimit: work.attemptLimit, attemptScorePolicy: work.attemptScorePolicy };
  const released = submission.status === "graded";
  const canRetry = latest?.id === submission.id && released && submission.attemptNumber < work.attemptLimit && (!work.dueAt || work.dueAt.getTime() > Date.now());
  return {
    work: publicWork,
    submission: { ...submission, totalAwarded: released ? submission.totalAwarded : null, reviewNotes: released ? submission.reviewNotes : null },
    questions: questions.map(({ id, position, type, prompt, points, options }) => ({ id, position, type, prompt, points, options })),
    answers: released ? answers : answers.map(({ questionId, responseText, responseData }) => ({ questionId, responseText, responseData })),
    attempts: attempts.map(attempt => ({ id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status, submittedAt: attempt.submittedAt, reviewedAt: attempt.reviewedAt, totalAwarded: attempt.status === "graded" ? attempt.totalAwarded : null, reviewNotes: attempt.status === "graded" ? attempt.reviewNotes : null })),
    canRetry,
  };
}

async function archiveAttempt(tx: TenantDb, schoolId: string, workId: string, studentId: string, submission: SubmissionRow) {
  const answers = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "questionId","responseText","responseData","awardedScore","markingMode","markerComment","createdAt","updatedAt" FROM "TeacherAcademicAnswer" WHERE "schoolId"=$1 AND "submissionId"=$2 ORDER BY "questionId"`, schoolId, submission.id);
  await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAttemptHistory"("id","schoolId","workId","studentId","attemptNumber","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","answers") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) ON CONFLICT ("workId","studentId","attemptNumber") DO NOTHING`, `tah_${randomUUID().replaceAll("-", "").slice(0, 24)}`, schoolId, workId, studentId, submission.attemptNumber, submission.startedAt, submission.submittedAt, submission.status, submission.totalAwarded, submission.reviewedBy, submission.reviewedAt, submission.reviewNotes, JSON.stringify(answers));
}

async function selectedPolicyAttempt(tx: TenantDb, schoolId: string, workId: string, studentId: string, policy: AttemptPolicy) {
  const order = policy === "latest" ? `"attemptNumber" DESC` : `"totalAwarded" DESC,"attemptNumber" DESC`;
  const rows = await tx.$queryRawUnsafe<Array<{ attemptNumber: number; totalAwarded: Prisma.Decimal }>>(`SELECT "attemptNumber","totalAwarded" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 AND "status"='graded' AND "totalAwarded" IS NOT NULL ORDER BY ${order} LIMIT 1`, schoolId, workId, studentId);
  return rows[0];
}

async function captureGradebookGuard(tx: TenantDb, input: { schoolId: string; workId: string; studentId: string; assessmentId: string; policy: AttemptPolicy }): Promise<GradebookGuard> {
  const [selected, current] = await Promise.all([
    selectedPolicyAttempt(tx, input.schoolId, input.workId, input.studentId, input.policy),
    tx.score.findUnique({ where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: input.assessmentId } }, select: { id: true, value: true, status: true, enteredAt: true } }),
  ]);
  const baseline = selected ? Number(selected.totalAwarded) : null;
  const currentValue = current ? Number(current.value) : null;
  const safe = baseline === null ? !current : !!current && current.status === "present" && currentValue === baseline;
  const expected: ScoreExpectation = current ? { id: current.id, value: currentValue!, status: current.status, enteredAt: current.enteredAt.toISOString() } : null;
  return { safe, expected, baseline, currentValue };
}

async function syncAttemptGradebook(tx: TenantDb, input: { schoolId: string; actorId: string; work: WorkRow; studentId: string; assessmentId: string; guard: GradebookGuard; strict: boolean }) {
  if (!input.guard.safe) {
    if (input.strict) throw new AppError("The gradebook mark changed after the previous attempt. Reload the latest gradebook result before finalizing this attempt.", 409, "SCORE_CONFLICT");
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_submission.gradebook_sync_skipped", entityType: "TeacherAcademicWork", entityId: input.work.id, after: { studentId: input.studentId, policy: input.work.attemptScorePolicy, expectedPrevious: input.guard.baseline, currentGradebook: input.guard.currentValue, reason: "manual_override" } });
    return { synced: false, selectedAttemptNumber: null, scoreId: null, reason: "manual_override" as const };
  }
  const selected = await selectedPolicyAttempt(tx, input.schoolId, input.work.id, input.studentId, input.work.attemptScorePolicy);
  if (!selected) throw new AppError("No released attempt is available to synchronize with the gradebook.", 409, "ATTEMPT_SCORE_UNAVAILABLE");
  const desired = Number(selected.totalAwarded);
  if (input.guard.expected && input.guard.currentValue === desired && input.guard.expected.status === "present") return { synced: true, selectedAttemptNumber: selected.attemptNumber, scoreId: input.guard.expected.id, reason: null };
  const score = await enterScore(tx, { schoolId: input.schoolId, actorId: input.actorId, studentId: input.studentId, assessmentId: input.assessmentId, value: desired, status: "present", expected: input.guard.expected });
  return { synced: true, selectedAttemptNumber: selected.attemptNumber, scoreId: score.id, reason: null };
}

export async function startGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string; attemptNumber?: number }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  if (input.attemptNumber !== undefined) {
    if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1 || input.attemptNumber > work.attemptLimit) throw new AppError("The requested attempt is invalid.", 400, "INVALID_ATTEMPT");
    const requested = await loadSubmissionAttempt(tx, input.schoolId, student.id, work.id, input.attemptNumber);
    if (!requested) throw new AppError("That attempt does not exist for this learner.", 404, "ATTEMPT_NOT_FOUND");
    return buildGuardianActivity(tx, { schoolId: input.schoolId, studentId: student.id }, work, requested);
  }
  let submission = await loadLatestSubmission(tx, input.schoolId, student.id, work.id);
  if (!submission || submission.status === "in_progress") {
    await requireOpenWorkTerm(tx, input.schoolId, work.termId);
    ensureWindowOpen(work, "The submission window has closed.");
  }
  if (!submission) {
    const id = `tas_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicSubmission"("id","schoolId","workId","studentId","attemptNumber","startedAt","status") VALUES($1,$2,$3,$4,1,NOW(),'in_progress')`, id, input.schoolId, work.id, student.id);
    submission = await loadLatestSubmission(tx, input.schoolId, student.id, work.id);
  }
  if (!submission) throw new AppError("Submission could not be opened.", 500, "SUBMISSION_ERROR");
  return buildGuardianActivity(tx, { schoolId: input.schoolId, studentId: student.id }, work, submission);
}

export async function retryGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  await requireOpenWorkTerm(tx, input.schoolId, work.termId);
  ensureWindowOpen(work, "The retry window has closed.");
  const latest = await loadLatestSubmission(tx, input.schoolId, student.id, work.id);
  if (!latest) throw new AppError("Complete the first attempt before starting a retry.", 409, "ATTEMPT_NOT_STARTED");
  if (latest.status !== "graded") throw new AppError("A new attempt can start only after the current attempt has been graded.", 409, "ATTEMPT_NOT_READY");
  if (latest.attemptNumber >= work.attemptLimit) throw new AppError("The allowed number of attempts has been used.", 409, "ATTEMPT_LIMIT_REACHED");
  await archiveAttempt(tx, input.schoolId, work.id, student.id, latest);
  const nextAttempt = latest.attemptNumber + 1;
  const id = `tas_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicSubmission"("id","schoolId","workId","studentId","attemptNumber","startedAt","status") VALUES($1,$2,$3,$4,$5,NOW(),'in_progress')`, id, input.schoolId, work.id, student.id, nextAttempt);
  const submission = await loadSubmissionAttempt(tx, input.schoolId, student.id, work.id, nextAttempt);
  if (!submission) throw new AppError("The retry could not be opened.", 500, "SUBMISSION_ERROR");
  return buildGuardianActivity(tx, { schoolId: input.schoolId, studentId: student.id }, work, submission);
}

export async function saveGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string; answers: Array<{ questionId: string; responseText?: string | null; responseData?: unknown }> }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  ensureWindowOpen(work, "The submission window has closed.");
  const started = await startGuardianSubmission(tx, input);
  if (!started.submission?.id) throw new AppError("Submission could not be opened.", 500, "SUBMISSION_ERROR");
  if (started.submission.status !== "in_progress") throw new AppError("Submitted answers cannot be changed.", 409, "SUBMISSION_CLOSED");
  await requireOpenWorkTerm(tx, input.schoolId, work.termId);
  for (const answer of input.answers) {
    const q = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, work.id, input.schoolId);
    if (!q[0]) throw new AppError("A submitted question is not part of this activity.", 400, "INVALID_QUESTION");
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAnswer"("id","schoolId","submissionId","questionId","responseText","responseData","markingMode") VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending') ON CONFLICT ("submissionId","questionId") DO UPDATE SET "responseText"=EXCLUDED."responseText","responseData"=EXCLUDED."responseData","updatedAt"=NOW()`, `taa_${randomUUID().replaceAll("-", "").slice(0, 24)}`, input.schoolId, started.submission.id, answer.questionId, answer.responseText ?? null, JSON.stringify(answer.responseData ?? null));
  }
  return { submissionId: started.submission.id, attemptNumber: started.submission.attemptNumber };
}

export async function submitGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  const submission = await loadLatestSubmission(tx, input.schoolId, student.id, work.id);
  if (!submission?.id) throw new AppError("Start the activity before submitting it.", 400, "SUBMISSION_NOT_STARTED");
  if (["submitted", "graded", "review_required"].includes(String(submission.status))) throw new AppError("This submission has already been submitted.", 409, "SUBMISSION_CLOSED");
  ensureWindowOpen(work, "The submission deadline has passed.");
  await requireOpenWorkTerm(tx, input.schoolId, work.termId);
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const answerRows = await tx.$queryRawUnsafe<Array<{ questionId: string; responseText: string | null; responseData: unknown }>>(`SELECT "questionId","responseText","responseData" FROM "TeacherAcademicAnswer" WHERE "schoolId"=$1 AND "submissionId"=$2`, input.schoolId, submission.id);
  const graded = gradeAcademicQuestions(
    questions.map(question => ({ id: question.id, type: question.type, points: Number(question.points), acceptedAnswers: question.acceptedAnswers })),
    new Map<string, AnswerInput>(answerRows.map(answer => [answer.questionId, answer])),
    work.answerGuide,
    work.markingMode
  );
  const total = graded.reduce((sum, item) => sum + Number(item.score), 0);
  const reviewRequired = graded.some((item) => item.markingMode === "manual" || item.markingMode === "suggested") || work.markingMode !== "auto" || questions.length === 0;
  for (const item of graded) await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicAnswer" SET "awardedScore"=$1,"markingMode"=$2,"markerComment"=$3,"updatedAt"=NOW() WHERE "submissionId"=$4 AND "questionId"=$5 AND "schoolId"=$6`, item.score, item.markingMode, item.suggestedScore === undefined ? item.reason : `Suggested score: ${item.suggestedScore}. Teacher review required. ${item.reason}`, submission.id, item.questionId, input.schoolId);
  let assessment: Awaited<ReturnType<typeof ensureWorkAssessment>> | null = null;
  let guard: GradebookGuard | null = null;
  if (!reviewRequired) {
    assessment = await ensureWorkAssessment(tx, input.schoolId, work.id, work.teacherId);
    guard = await captureGradebookGuard(tx, { schoolId: input.schoolId, workId: work.id, studentId: student.id, assessmentId: assessment.id, policy: work.attemptScorePolicy });
  }
  const status = reviewRequired ? "review_required" : "graded";
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "submittedAt"=NOW(),"status"=$1,"totalAwarded"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "schoolId"=$4`, status, total, submission.id, input.schoolId);
  let gradebookSync: { synced: boolean; selectedAttemptNumber: number | null; scoreId: string | null; reason: "manual_override" | null } | null = null;
  if (!reviewRequired && assessment && guard) gradebookSync = await syncAttemptGradebook(tx, { schoolId: input.schoolId, actorId: work.teacherId, work, studentId: student.id, assessmentId: assessment.id, guard, strict: submission.attemptNumber === 1 });
  return { submissionId: submission.id, attemptNumber: submission.attemptNumber, status, totalAwarded: reviewRequired ? null : total, maxScore: Number(work.maxScore), gradebookSync };
}

async function assertTeacherContext(tx: TenantDb, schoolId: string, teacherId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ classId: string; subjectId: string }>>(`SELECT "classId","subjectId" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, workId, schoolId);
  if (!rows[0]) throw new AppError("Work not found.", 404, "NOT_FOUND");
  if (await hasPermission(tx, teacherId, "scores:write:all")) return;
  if (!(await hasPermission(tx, teacherId, "scores:write:assigned"))) throw new ForbiddenError("Teacher review is not permitted.");
  const [assignment, classTeacher] = await Promise.all([
    tx.classSubjectTeacher.findFirst({ where: { schoolId, teacherId, classId: rows[0].classId, subjectId: rows[0].subjectId }, select: { teacherId: true } }),
    tx.class.findFirst({ where: { schoolId, id: rows[0].classId, classTeacherId: teacherId }, select: { id: true } })
  ]);
  if (!assignment && !classTeacher) throw new ForbiddenError("You can only review work in classes and subjects assigned to you.");
}

export async function getTeacherReviewQueue(tx: TenantDb, input: { schoolId: string; teacherId: string; workId: string }) {
  await assertTeacherContext(tx, input.schoolId, input.teacherId, input.workId);
  return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT s."id" AS "submissionId",st."id" AS "studentId",st."name" AS "studentName",s."attemptNumber",s."status",s."totalAwarded",s."submittedAt",s."reviewedAt",s."reviewNotes" FROM "TeacherAcademicSubmission" s INNER JOIN "Student" st ON st."id"=s."studentId" AND st."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND s."workId"=$2 AND s."status" IN ('submitted','review_required','graded') ORDER BY CASE WHEN s."status"='review_required' THEN 0 ELSE 1 END,s."attemptNumber" DESC,s."submittedAt" ASC NULLS LAST`, input.schoolId, input.workId);
}

export async function reviewTeacherSubmission(tx: TenantDb, input: { schoolId: string; teacherId: string; submissionId: string; reviewNotes?: string; answers: Array<{ questionId: string; awardedScore: number; markerComment?: string }> }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; workId: string; studentId: string; attemptNumber: number }>>(`SELECT "id","workId","studentId","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.submissionId, input.schoolId);
  const submission = rows[0];
  if (!submission) throw new AppError("Submission not found.", 404, "NOT_FOUND");
  await lockSubmission(tx, input.schoolId, submission.workId, submission.studentId);
  const currentRows = await tx.$queryRawUnsafe<Array<SubmissionRow & { workId: string; studentId: string }>>(`SELECT "id","workId","studentId","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.submissionId, input.schoolId);
  const current = currentRows[0];
  if (!current || !["submitted", "review_required", "graded"].includes(String(current.status))) throw new AppError("Only submitted work can be reviewed.", 409, "SUBMISSION_NOT_SUBMITTED");
  const latest = await loadLatestSubmission(tx, input.schoolId, submission.studentId, submission.workId);
  if (!latest || latest.attemptNumber !== current.attemptNumber) throw new AppError("This attempt has been superseded by a newer learner attempt and can no longer be changed.", 409, "ATTEMPT_SUPERSEDED");
  await assertTeacherContext(tx, input.schoolId, input.teacherId, submission.workId);
  const work = await getWork(tx, input.schoolId, submission.workId);
  const assessment = await ensureWorkAssessment(tx, input.schoolId, submission.workId, input.teacherId);
  const guard = await captureGradebookGuard(tx, { schoolId: input.schoolId, workId: submission.workId, studentId: submission.studentId, assessmentId: assessment.id, policy: work.attemptScorePolicy });
  if (!guard.safe) throw new AppError("The gradebook mark changed after the previous attempt. Reload the learner and gradebook state before reviewing this attempt.", 409, "SCORE_CONFLICT");
  const questionIds = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "TeacherAcademicQuestion" WHERE "schoolId"=$1 AND "workId"=$2', input.schoolId, submission.workId);
  const supplied = new Set(input.answers.map(answer => answer.questionId));
  if (!questionIds.length || supplied.size !== input.answers.length || questionIds.length !== supplied.size || questionIds.some(question => !supplied.has(question.id))) throw new AppError("Review every question exactly once before finalizing.", 400, "INCOMPLETE_REVIEW");
  for (const answer of input.answers) {
    const q = await tx.$queryRawUnsafe<Array<{ points: Prisma.Decimal }>>(`SELECT "points" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, submission.workId, input.schoolId);
    if (!q[0]) throw new AppError("Question not found.", 400, "INVALID_QUESTION");
    if (!Number.isFinite(answer.awardedScore) || answer.awardedScore < 0 || new Prisma.Decimal(answer.awardedScore).greaterThan(q[0].points)) throw new AppError("Awarded marks cannot exceed question points.", 400, "INVALID_SCORE");
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAnswer"("id","schoolId","submissionId","questionId","awardedScore","markingMode","markerComment") VALUES($1,$2,$3,$4,$5,'manual_review',$6) ON CONFLICT ("submissionId","questionId") DO UPDATE SET "awardedScore"=EXCLUDED."awardedScore","markingMode"='manual_review',"markerComment"=EXCLUDED."markerComment","updatedAt"=NOW()`, `taa_${randomUUID().replaceAll("-", "").slice(0, 24)}`, input.schoolId, input.submissionId, answer.questionId, answer.awardedScore, answer.markerComment ?? null);
  }
  const totalRows = await tx.$queryRawUnsafe<Array<{ total: Prisma.Decimal | null }>>(`SELECT COALESCE(SUM("awardedScore"),0) AS "total" FROM "TeacherAcademicAnswer" WHERE "schoolId"=$1 AND "submissionId"=$2`, input.schoolId, input.submissionId);
  const total = Number(totalRows[0]?.total ?? 0);
  if (total > Number(assessment.maxScore)) throw new AppError("Reviewed total exceeds the gradebook assessment maximum.", 400, "INVALID_TOTAL");
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "status"='graded',"totalAwarded"=$1,"reviewedBy"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4 AND "schoolId"=$5`, total, input.teacherId, input.reviewNotes ?? null, input.submissionId, input.schoolId);
  const sync = await syncAttemptGradebook(tx, { schoolId: input.schoolId, actorId: input.teacherId, work, studentId: submission.studentId, assessmentId: assessment.id, guard, strict: true });
  if (sync.synced && sync.scoreId && sync.selectedAttemptNumber === current.attemptNumber) await tx.score.update({ where: { id: sync.scoreId }, data: { remarks: input.reviewNotes ?? null } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "academic_submission.reviewed", entityType: "TeacherAcademicSubmission", entityId: input.submissionId, after: { attemptNumber: current.attemptNumber, totalAwarded: total, status: "graded", reviewNotes: input.reviewNotes ?? null, gradebookAttempt: sync.selectedAttemptNumber } });
  return { submissionId: input.submissionId, attemptNumber: current.attemptNumber, totalAwarded: total, status: "graded", gradebookAttempt: sync.selectedAttemptNumber };
}

/** Save the exact final answers and submit within the caller's tenant transaction. */
export async function finalizeGuardianSubmission(tx: TenantDb, input: Parameters<typeof saveGuardianSubmission>[1]) {
  await saveGuardianSubmission(tx, input);
  return submitGuardianSubmission(tx, input);
}
