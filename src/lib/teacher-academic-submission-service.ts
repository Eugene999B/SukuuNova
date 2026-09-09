import { ensureWorkAssessment } from "./academic-work-gradebook";
import { hasPermission } from "./rbac";
import { enterScore } from "./gradebook-service";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";

type WorkRow = {
  id: string; schoolId: string; termId: string; classId: string; subjectId: string;
  title: string; kind: string; instructions: string | null; maxScore: Prisma.Decimal;
  answerGuide: unknown; markingMode: string; dueAt: Date | null; status: string;
};
type QuestionRow = {
  id: string; position: number; type: string; prompt: string; points: Prisma.Decimal;
  options: unknown; acceptedAnswers: unknown;
};
type AnswerInput = { responseText?: string | null; responseData?: unknown };

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function exactAnswerScore(response: string, accepted: string[], points: number) {
  const canonical = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const value = canonical(response);
  if (!value) return 0;
  return accepted.some((answer) => canonical(answer) === value) ? points : 0;
}
function suggestedWrittenScore(response: string, guide: string[], points: number) {
  if (!response.trim() || guide.length === 0) return { score: 0, confidence: 0, reason: "No answer guidance is available for semantic review." };
  const responseTokens = new Set(normalize(response).split(" ").filter((word) => word.length > 2));
  const guideTokens = new Set(normalize(guide.join(" ")).split(" ").filter((word) => word.length > 2));
  if (!responseTokens.size || !guideTokens.size) return { score: 0, confidence: 0, reason: "The response or answer guide has no usable key terms." };
  let overlap = 0;
  for (const token of responseTokens) if (guideTokens.has(token)) overlap += 1;
  const precision = overlap / responseTokens.size;
  const recall = overlap / guideTokens.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    score: Math.round(points * Math.min(1, f1 * 1.2) * 100) / 100,
    confidence: Math.round(Math.min(1, f1 * 1.35) * 100),
    reason: `${overlap} key terms matched across the submitted response and teacher guidance.`
  };
}
async function getWork(tx: TenantDb, schoolId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<WorkRow[]>(`SELECT "id","schoolId","termId","classId","subjectId","title","kind","instructions","maxScore","markingMode","answerGuide","dueAt","status" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, workId, schoolId);
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
  if (!selected) return { students, selectedStudent: null, subjects: [], works: [], notes: [] };
  await assertLinkedStudent(tx, input.schoolId, input.guardianId, selected.id);
  const subjects = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(`SELECT DISTINCT sub."id",sub."name" FROM "TeacherAcademicWork" w INNER JOIN "Subject" sub ON sub."id"=w."subjectId" AND sub."schoolId"=w."schoolId" WHERE w."schoolId"=$1 AND w."classId"=$2 AND w."status"='published' ORDER BY sub."name" ASC`, input.schoolId, selected.classId);
  const filter = input.subjectId ? ` AND w."subjectId"=$3` : "";
  const params: unknown[] = input.subjectId ? [input.schoolId, selected.classId, input.subjectId] : [input.schoolId, selected.classId];
  const works = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT w."id",w."termId",w."classId",w."subjectId",w."kind",w."title",w."instructions",w."workDate",w."weekNumber",w."workNumber",w."maxScore",w."markingMode",w."dueAt",w."status",sub."name" AS "subjectName",COALESCE(ts."status",'not_started') AS "submissionStatus",CASE WHEN ts."status"='graded' THEN ts."totalAwarded" ELSE NULL END AS "totalAwarded" FROM "TeacherAcademicWork" w INNER JOIN "Subject" sub ON sub."id"=w."subjectId" AND sub."schoolId"=w."schoolId" LEFT JOIN "TeacherAcademicSubmission" ts ON ts."workId"=w."id" AND ts."studentId"=$${params.length + 1} AND ts."schoolId"=w."schoolId" WHERE w."schoolId"=$1 AND w."classId"=$2${filter} AND w."status"='published' ORDER BY w."workDate" DESC,w."workNumber" ASC`, ...params, selected.id);
  const notes = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT n."id",n."title",n."weekNumber",n."publishedAt",n."content",sub."name" AS "subjectName" FROM "TeacherAcademicNote" n INNER JOIN "Subject" sub ON sub."id"=n."subjectId" AND sub."schoolId"=n."schoolId" WHERE n."schoolId"=$1 AND n."classId"=$2 AND n."status"='published'${input.subjectId ? ` AND n."subjectId"=$3` : ""} ORDER BY n."publishedAt" DESC NULLS LAST,n."updatedAt" DESC`, ...params);
  return { students, selectedStudent: selected, subjects, works, notes };
}
async function loadSubmission(tx: TenantDb, schoolId: string, studentId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "id","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 LIMIT 1`, schoolId, workId, studentId);
  return rows[0];
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
export async function startGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  const existing = await loadSubmission(tx, input.schoolId, student.id, work.id);
  if (!existing || existing.status === "in_progress") {
    await requireOpenWorkTerm(tx, input.schoolId, work.termId);
    if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError("The submission window has closed.", 409, "WORK_EXPIRED");
  }
  if (!existing) {
    const id = `tas_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicSubmission"("id","schoolId","workId","studentId","startedAt","status") VALUES($1,$2,$3,$4,NOW(),'in_progress')`, id, input.schoolId, work.id, student.id);
  }
  const submission = await loadSubmission(tx, input.schoolId, student.id, work.id);
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const answers = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "questionId","responseText","responseData","awardedScore","markingMode","markerComment" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1 ORDER BY "questionId"`, submission?.id);
  const publicWork = { id: work.id, schoolId: work.schoolId, termId: work.termId, classId: work.classId, subjectId: work.subjectId, title: work.title, kind: work.kind, instructions: work.instructions, maxScore: work.maxScore, markingMode: work.markingMode, dueAt: work.dueAt, status: work.status };
  const released = submission?.status === "graded";
  return {
    work: publicWork,
    submission: submission ? { ...submission, totalAwarded: released ? submission.totalAwarded : null, reviewNotes: released ? submission.reviewNotes : null } as Record<string, unknown> : submission,
    questions: questions.map(({ id, position, type, prompt, points, options }) => ({ id, position, type, prompt, points, options })),
    answers: released ? answers : answers.map(({ questionId, responseText, responseData }) => ({ questionId, responseText, responseData }))
  };
}
async function gradeAnswers(questions: QuestionRow[], answers: Map<string, AnswerInput>, guide: unknown, mode: string) {
  const answerGuide = asStrings(guide);
  return questions.map((question) => {
    const response = answers.get(question.id) ?? {};
    const responseText = String(response.responseText ?? "");
    const points = Number(question.points);
    if (question.type === "multiple_choice" || question.type === "true_false") {
      const selected = typeof response.responseData === "string" ? response.responseData : responseText;
      const score = exactAnswerScore(selected, asStrings(question.acceptedAnswers), points);
      return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Matched teacher-supplied accepted answer." : "Did not match a teacher-supplied accepted answer." };
    }
    if (question.type === "short_answer") {
      const score = exactAnswerScore(responseText, asStrings(question.acceptedAnswers), points);
      if (score > 0 || mode === "auto") return { questionId: question.id, score, markingMode: "auto", reason: score > 0 ? "Normalized answer matched." : "No accepted normalized answer matched." };
    }
    const suggested = suggestedWrittenScore(responseText, answerGuide, points);
    return { questionId: question.id, score: 0, suggestedScore: suggested.score, confidence: suggested.confidence, markingMode: mode === "review" ? "suggested" : "manual", reason: suggested.reason };
  });
}
export async function saveGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string; answers: Array<{ questionId: string; responseText?: string | null; responseData?: unknown }> }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const { work } = { work: await getWork(tx, input.schoolId, input.workId) };
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError("The submission window has closed.", 409, "WORK_EXPIRED");
  const started = await startGuardianSubmission(tx, input);
  if (!started.submission?.id) throw new AppError("Submission could not be opened.", 500, "SUBMISSION_ERROR");
  if (started.submission.status !== "in_progress") throw new AppError("Submitted answers cannot be changed.", 409, "SUBMISSION_CLOSED");
  await requireOpenWorkTerm(tx, input.schoolId, work.termId);
  for (const answer of input.answers) {
    const q = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, work.id, input.schoolId);
    if (!q[0]) throw new AppError("A submitted question is not part of this activity.", 400, "INVALID_QUESTION");
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAnswer"("id","schoolId","submissionId","questionId","responseText","responseData","markingMode") VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending') ON CONFLICT ("submissionId","questionId") DO UPDATE SET "responseText"=EXCLUDED."responseText","responseData"=EXCLUDED."responseData","updatedAt"=NOW()`, `taa_${randomUUID().replaceAll("-", "").slice(0, 24)}`, input.schoolId, started.submission.id, answer.questionId, answer.responseText ?? null, JSON.stringify(answer.responseData ?? null));
  }
  return { submissionId: started.submission.id };
}
export async function submitGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  await lockSubmission(tx, input.schoolId, input.workId, input.studentId);
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  const submission = await loadSubmission(tx, input.schoolId, student.id, work.id);
  if (!submission?.id) throw new AppError("Start the activity before submitting it.", 400, "SUBMISSION_NOT_STARTED");
  if (["submitted","graded","review_required"].includes(String(submission.status))) throw new AppError("This submission has already been submitted.", 409, "SUBMISSION_CLOSED");
  if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError("The submission deadline has passed.", 409, "WORK_EXPIRED");
  await requireOpenWorkTerm(tx, input.schoolId, work.termId);
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const answerRows = await tx.$queryRawUnsafe<Array<{ questionId: string; responseText: string | null; responseData: unknown }>>(`SELECT "questionId","responseText","responseData" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1`, submission.id);
  const graded = await gradeAnswers(questions, new Map(answerRows.map((answer) => [answer.questionId, answer])), work.answerGuide, work.markingMode);
  const total = graded.reduce((sum, item) => sum + Number(item.score), 0);
  const reviewRequired = graded.some((item) => item.markingMode === "manual" || item.markingMode === "suggested") || work.markingMode !== "auto" || questions.length === 0;
  for (const item of graded) await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicAnswer" SET "awardedScore"=$1,"markingMode"=$2,"markerComment"=$3,"updatedAt"=NOW() WHERE "submissionId"=$4 AND "questionId"=$5 AND "schoolId"=$6`, item.score, item.markingMode, item.suggestedScore === undefined ? item.reason : `Suggested score: ${item.suggestedScore}. Teacher review required. ${item.reason}`, submission.id, item.questionId, input.schoolId);
  const status = reviewRequired ? "review_required" : "graded";
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "submittedAt"=NOW(),"status"=$1,"totalAwarded"=$2,"updatedAt"=NOW() WHERE "id"=$3`, status, total, submission.id);
  return { submissionId: submission.id, status, totalAwarded: reviewRequired ? null : total, maxScore: Number(work.maxScore) };
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
  return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT s."id" AS "submissionId",st."id" AS "studentId",st."name" AS "studentName",s."status",s."totalAwarded",s."submittedAt",s."reviewedAt",s."reviewNotes" FROM "TeacherAcademicSubmission" s INNER JOIN "Student" st ON st."id"=s."studentId" AND st."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND s."workId"=$2 AND s."status" IN ('submitted','review_required','graded') ORDER BY CASE WHEN s."status"='review_required' THEN 0 ELSE 1 END,s."submittedAt" ASC NULLS LAST`, input.schoolId, input.workId);
}
export async function reviewTeacherSubmission(tx: TenantDb, input: { schoolId: string; teacherId: string; submissionId: string; reviewNotes?: string; answers: Array<{ questionId: string; awardedScore: number; markerComment?: string }> }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; workId: string; studentId: string }>>(`SELECT "id","workId","studentId" FROM "TeacherAcademicSubmission" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.submissionId, input.schoolId);
  const submission = rows[0]; if (!submission) throw new AppError("Submission not found.",404,"NOT_FOUND");
  await lockSubmission(tx, input.schoolId, submission.workId, submission.studentId);
  const current = await loadSubmission(tx, input.schoolId, submission.studentId, submission.workId);
  if (!current || !["submitted", "review_required", "graded"].includes(String(current.status))) throw new AppError("Only submitted work can be reviewed.", 409, "SUBMISSION_NOT_SUBMITTED");
  await assertTeacherContext(tx, input.schoolId, input.teacherId, submission.workId);
  const workRows = await tx.$queryRawUnsafe<Array<{ termId: string; classId: string; subjectId: string; title: string }>>(`SELECT "termId","classId","subjectId","title" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, submission.workId, input.schoolId);
  const work = workRows[0]; if (!work) throw new AppError("Work not found.",404,"NOT_FOUND");
  const assessment = await ensureWorkAssessment(tx, input.schoolId, submission.workId, input.teacherId);
  const questionIds = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "TeacherAcademicQuestion" WHERE "schoolId"=$1 AND "workId"=$2', input.schoolId, submission.workId);
  const supplied = new Set(input.answers.map(answer => answer.questionId));
  if (!questionIds.length || supplied.size !== input.answers.length || questionIds.length !== supplied.size || questionIds.some(question => !supplied.has(question.id))) throw new AppError("Review every question exactly once before finalizing.", 400, "INCOMPLETE_REVIEW");
  for (const answer of input.answers) {
    const q = await tx.$queryRawUnsafe<Array<{ points: Prisma.Decimal }>>(`SELECT "points" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, submission.workId, input.schoolId);
    if (!q[0]) throw new AppError("Question not found.",400,"INVALID_QUESTION");
    if (!Number.isFinite(answer.awardedScore) || answer.awardedScore < 0 || new Prisma.Decimal(answer.awardedScore).greaterThan(q[0].points)) throw new AppError("Awarded marks cannot exceed question points.",400,"INVALID_SCORE");
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAnswer"("id","schoolId","submissionId","questionId","awardedScore","markingMode","markerComment") VALUES($1,$2,$3,$4,$5,'manual_review',$6) ON CONFLICT ("submissionId","questionId") DO UPDATE SET "awardedScore"=EXCLUDED."awardedScore","markingMode"='manual_review',"markerComment"=EXCLUDED."markerComment","updatedAt"=NOW()`, `taa_${randomUUID().replaceAll("-", "").slice(0, 24)}`, input.schoolId, input.submissionId, answer.questionId, answer.awardedScore, answer.markerComment ?? null);
  }
  const totalRows = await tx.$queryRawUnsafe<Array<{ total: Prisma.Decimal | null }>>(`SELECT COALESCE(SUM("awardedScore"),0) AS "total" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1`, input.submissionId);
  const total = Number(totalRows[0]?.total ?? 0);
  if (total > Number(assessment.maxScore)) throw new AppError("Reviewed total exceeds the gradebook assessment maximum.",400,"INVALID_TOTAL");
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "status"='graded',"totalAwarded"=$1,"reviewedBy"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4`, total,input.teacherId,input.reviewNotes ?? null,input.submissionId);
  const score = await enterScore(tx, { schoolId: input.schoolId, actorId: input.teacherId, studentId: submission.studentId, assessmentId: assessment.id, value: total, status: "present" });
  await tx.score.update({ where: { id: score.id }, data: { remarks: input.reviewNotes ?? null } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "academic_submission.reviewed", entityType: "TeacherAcademicSubmission", entityId: input.submissionId, after: { totalAwarded: total, status: "graded", reviewNotes: input.reviewNotes ?? null } });
  return { submissionId: input.submissionId, totalAwarded: total, status: "graded" };
}
