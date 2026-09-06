import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";

const OBJECTIVE_TYPES = new Set(["multiple_choice", "true_false", "short_answer"]);

type WorkRow = {
  id: string;
  schoolId: string;
  termId: string;
  classId: string;
  subjectId: string;
  title: string;
  kind: string;
  instructions: string | null;
  maxScore: Prisma.Decimal;
  markingMode: string;
  dueAt: Date | null;
  status: string;
};

type QuestionRow = {
  id: string;
  position: number;
  type: string;
  prompt: string;
  points: Prisma.Decimal;
  options: unknown;
  acceptedAnswers: unknown;
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 2));
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function exactAnswerScore(response: string, accepted: string[], points: number) {
  const normalizedResponse = normalize(response);
  if (!normalizedResponse) return 0;
  return accepted.some((answer) => normalize(answer) === normalizedResponse) ? points : 0;
}

function suggestedWrittenScore(response: string, guide: string[], points: number) {
  if (!response.trim() || guide.length === 0) return { score: 0, confidence: 0, reason: "No answer guidance is available for semantic review." };
  const responseTokens = tokens(response);
  const guideTokens = tokens(guide.join(" "));
  if (!responseTokens.size || !guideTokens.size) return { score: 0, confidence: 0, reason: "The response or answer guide has no usable key terms." };
  let overlap = 0;
  for (const token of responseTokens) if (guideTokens.has(token)) overlap += 1;
  const precision = overlap / responseTokens.size;
  const recall = overlap / guideTokens.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const score = Math.round(points * Math.min(1, f1 * 1.2) * 100) / 100;
  return { score, confidence: Math.round(Math.min(1, f1 * 1.35) * 100), reason: `${overlap} key terms matched across the submitted response and teacher guidance.` };
}

async function getWork(tx: TenantDb, schoolId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<WorkRow[]>(`SELECT "id","schoolId","termId","classId","subjectId","title","kind","instructions","maxScore","markingMode","dueAt","status" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, workId, schoolId);
  const work = rows[0];
  if (!work) throw new AppError("Academic work was not found.", 404, "NOT_FOUND");
  if (work.status !== "published") throw new AppError("This activity is not currently published.", 409, "WORK_NOT_PUBLISHED");
  return work;
}

async function assertLinkedStudent(tx: TenantDb, schoolId: string, guardianId: string, studentId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; classId: string | null }>>(`SELECT s."id",s."classId" FROM "Student" s INNER JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" WHERE sg."schoolId"=$1 AND sg."guardianId"=$2 AND s."id"=$3 LIMIT 1`, schoolId, guardianId, studentId);
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
  const subjectFilter = input.subjectId ? ` AND w."subjectId"=$3` : "";
  const params: unknown[] = input.subjectId ? [input.schoolId, selected.classId, input.subjectId] : [input.schoolId, selected.classId];
  const works = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT w."id",w."termId",w."classId",w."subjectId",w."kind",w."title",w."instructions",w."workDate",w."weekNumber",w."workNumber",w."maxScore",w."markingMode",w."dueAt",w."status",sub."name" AS "subjectName",COALESCE(ts."status",'not_started') AS "submissionStatus",ts."totalAwarded" FROM "TeacherAcademicWork" w INNER JOIN "Subject" sub ON sub."id"=w."subjectId" AND sub."schoolId"=w."schoolId" LEFT JOIN "TeacherAcademicSubmission" ts ON ts."workId"=w."id" AND ts."studentId"=$${params.length + 1} WHERE w."schoolId"=$1 AND w."classId"=$2${subjectFilter} AND w."status"='published' ORDER BY w."workDate" DESC,w."workNumber" ASC`, ...params, selected.id);
  const notes = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT n."id",n."title",n."weekNumber",n."publishedAt",n."content",sub."name" AS "subjectName" FROM "TeacherAcademicNote" n INNER JOIN "Subject" sub ON sub."id"=n."subjectId" AND sub."schoolId"=n."schoolId" WHERE n."schoolId"=$1 AND n."classId"=$2 AND n."status"='published'${input.subjectId ? " AND n.\"subjectId\"=$3" : ""} ORDER BY n."publishedAt" DESC NULLS LAST,n."updatedAt" DESC`, ...params);
  return { students, selectedStudent: selected, subjects, works, notes };
}

export async function startGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError("The submission window has closed.", 409, "WORK_EXPIRED");
  const id = `tas_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicSubmission"("id","schoolId","workId","studentId","startedAt","status") VALUES($1,$2,$3,$4,NOW(),'in_progress') ON CONFLICT ("workId","studentId") DO UPDATE SET "updatedAt"=NOW()`, id, input.schoolId, work.id, input.studentId);
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "id","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes" FROM "TeacherAcademicSubmission" WHERE "workId"=$1 AND "studentId"=$2 LIMIT 1`, work.id, input.studentId);
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const answers = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "questionId","responseText","responseData","awardedScore","markingMode","markerComment" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1 ORDER BY "questionId"`, rows[0]?.id);
  return { work, submission: rows[0], questions, answers };
}

async function gradeAnswers(questions: QuestionRow[], answerByQuestion: Map<string, { responseText?: string; responseData?: unknown }>, answerGuide: unknown, mode: string) {
  const guide = asStrings(answerGuide);
  return questions.map((question) => {
    const response = answerByQuestion.get(question.id) ?? {};
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
    const suggested = suggestedWrittenScore(responseText, guide, points);
    return { questionId: question.id, score: mode === "review" ? suggested.score : 0, suggestedScore: suggested.score, confidence: suggested.confidence, markingMode: mode === "review" ? "suggested" : "manual", reason: suggested.reason };
  });
}

export async function saveGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string; answers: Array<{ questionId: string; responseText?: string; responseData?: unknown }> }) {
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  if (work.dueAt && work.dueAt.getTime() <= Date.now()) throw new AppError("The submission window has closed.", 409, "WORK_EXPIRED");
  await startGuardianSubmission(tx, input);
  const submissionRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "TeacherAcademicSubmission" WHERE "workId"=$1 AND "studentId"=$2 LIMIT 1`, work.id, student.id);
  const submissionId = submissionRows[0]?.id;
  if (!submissionId) throw new AppError("Submission could not be opened.", 500, "SUBMISSION_ERROR");
  for (const answer of input.answers) {
    const question = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, work.id, input.schoolId);
    if (!question[0]) throw new AppError("A submitted question is not part of this activity.", 400, "INVALID_QUESTION");
    await tx.$executeRawUnsafe(`INSERT INTO "TeacherAcademicAnswer"("id","schoolId","submissionId","questionId","responseText","responseData","markingMode") VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending') ON CONFLICT ("submissionId","questionId") DO UPDATE SET "responseText"=EXCLUDED."responseText","responseData"=EXCLUDED."responseData","updatedAt"=NOW()`, `taa_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`, input.schoolId, submissionId, answer.questionId, answer.responseText ?? null, JSON.stringify(answer.responseData ?? null));
  }
  return { submissionId };
}

export async function submitGuardianSubmission(tx: TenantDb, input: { schoolId: string; guardianId: string; studentId: string; workId: string }) {
  const work = await getWork(tx, input.schoolId, input.workId);
  const student = await assertLinkedStudent(tx, input.schoolId, input.guardianId, input.studentId);
  if (student.classId !== work.classId) throw new ForbiddenError("This activity is not assigned to the selected child.");
  const questions = await tx.$queryRawUnsafe<QuestionRow[]>(`SELECT "id","position","type","prompt","points","options","acceptedAnswers" FROM "TeacherAcademicQuestion" WHERE "workId"=$1 AND "schoolId"=$2 ORDER BY "position" ASC`, work.id, input.schoolId);
  const submissionRows = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(`SELECT "id","status" FROM "TeacherAcademicSubmission" WHERE "workId"=$1 AND "studentId"=$2 LIMIT 1`, work.id, student.id);
  const submission = submissionRows[0];
  if (!submission) throw new AppError("Start the activity before submitting it.", 400, "SUBMISSION_NOT_STARTED");
  if (submission.status === "submitted" || submission.status === "graded" || submission.status === "review_required") throw new AppError("This submission has already been submitted.", 409, "SUBMISSION_CLOSED");
  if (work.dueAt && work.dueAt.getTime() < Date.now()) {
    throw new AppError("The submission deadline has passed.", 409, "WORK_EXPIRED");
  }
  const answerRows = await tx.$queryRawUnsafe<Array<{ questionId: string; responseText: string | null; responseData: unknown }>>(`SELECT "questionId","responseText","responseData" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1`, submission.id);
  const graded = await gradeAnswers(questions, new Map(answerRows.map((answer) => [answer.questionId, answer])), work.answerGuide, work.markingMode);
  const total = graded.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
  const needsReview = work.markingMode === "review" || graded.some((item) => item.markingMode === "manual" || item.markingMode === "suggested");
  for (const item of graded) {
    await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicAnswer" SET "awardedScore"=$1,"markingMode"=$2,"markerComment"=$3,"responseData"=COALESCE("responseData",'{}'::jsonb) || $4::jsonb,"updatedAt"=NOW() WHERE "submissionId"=$5 AND "questionId"=$6`, item.score, item.markingMode, item.reason, JSON.stringify({ suggestedScore: item.suggestedScore ?? null, confidence: item.confidence ?? null }), submission.id, item.questionId);
  }
  const finalStatus = needsReview ? "review_required" : "graded";
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "submittedAt"=NOW(),"status"=$1,"totalAwarded"=$2,"updatedAt"=NOW() WHERE "id"=$3`, finalStatus, total, submission.id);
  return { submissionId: submission.id, status: finalStatus, totalAwarded: total, maxScore: Number(work.maxScore) };
}

async function assertTeacherContext(tx: TenantDb, schoolId: string, teacherId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ classId: string; subjectId: string }>>(`SELECT "classId","subjectId" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, workId, schoolId);
  if (!rows[0]) throw new AppError("Work not found.", 404, "NOT_FOUND");
  const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId, teacherId, classId: rows[0].classId, subjectId: rows[0].subjectId }, select: { teacherId: true } });
  const classTeacher = await tx.class.findFirst({ where: { schoolId, id: rows[0].classId, classTeacherId: teacherId }, select: { id: true } });
  if (!assignment && !classTeacher) throw new ForbiddenError("You can only review work in classes and subjects assigned to you.");
}

export async function getTeacherReviewQueue(tx: TenantDb, input: { schoolId: string; teacherId: string; workId: string }) {
  await assertTeacherContext(tx, input.schoolId, input.teacherId, input.workId);
  return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT s."id" AS "submissionId",st."id" AS "studentId",st."name" AS "studentName",s."status",s."totalAwarded",s."submittedAt",s."reviewedAt",s."reviewNotes" FROM "TeacherAcademicSubmission" s INNER JOIN "Student" st ON st."id"=s."studentId" AND st."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND s."workId"=$2 ORDER BY CASE WHEN s."status"='review_required' THEN 0 ELSE 1 END,s."submittedAt" ASC NULLS LAST`, input.schoolId, input.workId);
}

export async function reviewTeacherSubmission(tx: TenantDb, input: { schoolId: string; teacherId: string; submissionId: string; reviewNotes?: string; answers: Array<{ questionId: string; awardedScore: number; markerComment?: string }> }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; workId: string; studentId: string }>>(`SELECT "id","workId","studentId" FROM "TeacherAcademicSubmission" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, input.submissionId, input.schoolId);
  const submission = rows[0];
  if (!submission) throw new AppError("Submission not found.", 404, "NOT_FOUND");
  await assertTeacherContext(tx, input.schoolId, input.teacherId, submission.workId);
  const workRows = await tx.$queryRawUnsafe<Array<{ termId: string; subjectId: string; title: string; maxScore: Prisma.Decimal }>>(`SELECT "termId","subjectId","title","maxScore" FROM "TeacherAcademicWork" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, submission.workId, input.schoolId);
  const work = workRows[0];
  if (!work) throw new AppError("Work not found.", 404, "NOT_FOUND");
  for (const answer of input.answers) {
    const q = await tx.$queryRawUnsafe<Array<{ points: Prisma.Decimal }>>(`SELECT "points" FROM "TeacherAcademicQuestion" WHERE "id"=$1 AND "workId"=$2 AND "schoolId"=$3 LIMIT 1`, answer.questionId, submission.workId, input.schoolId);
    if (!q[0]) throw new AppError("Question not found.", 400, "INVALID_QUESTION");
    if (answer.awardedScore < 0 || new Prisma.Decimal(answer.awardedScore).greaterThan(q[0].points)) throw new AppError("Awarded marks cannot exceed question points.", 400, "INVALID_SCORE");
    await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicAnswer" SET "awardedScore"=$1,"markingMode"='manual_review',"markerComment"=$2,"updatedAt"=NOW() WHERE "submissionId"=$3 AND "questionId"=$4`, answer.awardedScore, answer.markerComment ?? null, input.submissionId, answer.questionId);
  }
  const totalRows = await tx.$queryRawUnsafe<Array<{ total: Prisma.Decimal | null }>>(`SELECT COALESCE(SUM("awardedScore"),0) AS "total" FROM "TeacherAcademicAnswer" WHERE "submissionId"=$1`, input.submissionId);
  const total = Number(totalRows[0]?.total ?? 0);
  await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicSubmission" SET "status"='graded',"totalAwarded"=$1,"reviewedBy"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4`, total, input.teacherId, input.reviewNotes ?? null, input.submissionId);
  const existing = await tx.assessment.findFirst({ where: { schoolId: input.schoolId, termId: work.termId, classId: (await tx.student.findUnique({ where: { id_schoolId: { id: submission.studentId, schoolId: input.schoolId } }, select: { classId: true } }))?.classId ?? undefined, subjectId: work.subjectId, name: work.title }, select: { id: true, maxScore: true } });
  if (!existing) throw new AppError("The corresponding gradebook assessment does not exist yet. Enter or create the work mark first.", 409, "ASSESSMENT_NOT_READY");
  if (total > Number(existing.maxScore)) throw new AppError("Reviewed total exceeds the gradebook assessment maximum.", 400, "INVALID_TOTAL");
  await tx.score.upsert({ where: { studentId_assessmentId: { studentId: submission.studentId, assessmentId: existing.id } }, update: { value: new Prisma.Decimal(total), status: "present", enteredBy: input.teacherId, enteredAt: new Date(), remarks: input.reviewNotes ?? null }, create: { schoolId: input.schoolId, studentId: submission.studentId, subjectId: work.subjectId, assessmentId: existing.id, value: new Prisma.Decimal(total), status: "present", enteredBy: input.teacherId, remarks: input.reviewNotes ?? null } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.teacherId, action: "academic_submission.reviewed", entityType: "TeacherAcademicSubmission", entityId: input.submissionId, after: { totalAwarded: total, status: "graded", reviewNotes: input.reviewNotes ?? null } });
  return { submissionId: input.submissionId, totalAwarded: total, status: "graded" };
}
