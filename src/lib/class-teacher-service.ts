import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { selectAcademicTerm } from "@/lib/term-date";
import { recordPromotionDecision } from "@/lib/academic-structure-service";

export type ClassTeacherRecommendationOutcome = "promoted" | "retained" | "graduated" | "transferred" | "withdrawn" | "deferred";

type Policy = { termId: string; academicYearId: string; isYearEnd: boolean; closingStatus: string; classTeacherReviewCloseAt: Date | null };
type YearEnrollment = { id: string; studentId: string; frameworkId: string; gradeLevelId: string; pathwayId: string | null; status: string; gradeName: string; isTerminal: boolean; pathwayRequired: boolean };
type Progression = { outcome: "advance" | "complete" | "exit"; toGradeLevelId: string | null; targetPathwayId: string | null; targetGradeName: string | null };
type Decision = { id: string; studentId: string; outcome: ClassTeacherRecommendationOutcome; status: string; reason: string | null; targetGradeLevelId: string | null; targetPathwayId: string | null; targetGradeName: string | null; targetPathwayName: string | null };

function day(value: Date) { return value.toISOString().slice(0, 10); }

async function assertClassTeacher(tx: TenantDb, schoolId: string, actorId: string, classId: string) {
  const schoolClass = await tx.class.findFirst({ where: { id: classId, schoolId, classTeacherId: actorId }, select: { id: true, name: true, level: true } });
  if (!schoolClass) throw new AppError("You are not the assigned class teacher for this class.", 403, "CLASS_TEACHER_SCOPE_REQUIRED");
  return schoolClass;
}

async function sessionPolicy(tx: TenantDb, schoolId: string, termId: string) {
  const rows = await tx.$queryRawUnsafe<Policy[]>(`SELECT "termId","academicYearId","isYearEnd","closingStatus","classTeacherReviewCloseAt" FROM "AcademicSessionPolicy" WHERE "schoolId"=$1 AND "termId"=$2 LIMIT 1`, schoolId, termId);
  return rows[0] ?? null;
}

export async function getClassTeacherDesk(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  classId?: string | null;
  termId?: string | null;
  now?: Date;
}) {
  const [classes, terms, policies] = await Promise.all([
    tx.class.findMany({ where: { schoolId: input.schoolId, classTeacherId: input.actorId }, select: { id: true, name: true, level: true }, orderBy: { name: "asc" } }),
    tx.term.findMany({ where: { schoolId: input.schoolId }, include: { academicYear: true }, orderBy: { startDate: "desc" }, take: 16 }),
    tx.$queryRawUnsafe<Policy[]>(`SELECT "termId","academicYearId","isYearEnd","closingStatus","classTeacherReviewCloseAt" FROM "AcademicSessionPolicy" WHERE "schoolId"=$1`, input.schoolId),
  ]);
  if (!classes.length) return { classes: [], terms: [], selectedClass: null, selectedTerm: null, learners: [], summary: null };
  const selectedClass = classes.find((item) => item.id === input.classId) ?? classes[0];
  await assertClassTeacher(tx, input.schoolId, input.actorId, selectedClass.id);
  const policyByTerm = new Map(policies.map((item) => [item.termId, item]));
  const now = input.now ?? new Date();
  const automatic = selectAcademicTerm(terms, input.termId || undefined, now, "Africa/Accra");
  const selectedTerm = automatic ?? terms.find((term) => term.id === input.termId) ?? terms[0] ?? null;
  if (!selectedTerm) return { classes, terms: [], selectedClass, selectedTerm: null, learners: [], summary: null };
  const policy = policyByTerm.get(selectedTerm.id) ?? null;

  const [roster, assessmentRows, scoreRows, attendanceRows, reports, yearEnrollments, progressionRows, decisions, pathways] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ studentId: string; name: string; admissionNo: string; guardianName: string | null; guardianPhone: string | null }>>(
      `SELECT DISTINCT s."id" AS "studentId",s."name",s."admissionNo",g."name" AS "guardianName",g."phone" AS "guardianPhone"
         FROM "Enrollment" e
         JOIN "Student" s ON s."id"=e."studentId" AND s."schoolId"=e."schoolId"
         LEFT JOIN "StudentGuardian" sg ON sg."studentId"=s."id" AND sg."schoolId"=s."schoolId" AND sg."isPrimary"=true
         LEFT JOIN "Guardian" g ON g."id"=sg."guardianId" AND g."schoolId"=sg."schoolId"
        WHERE e."schoolId"=$1 AND e."termId"=$2 AND e."classId"=$3 AND e."status" IN ('draft','ready','confirmed')
        ORDER BY s."name"`, input.schoolId, selectedTerm.id, selectedClass.id),
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS "count" FROM "Assessment" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3`, input.schoolId, selectedTerm.id, selectedClass.id),
    tx.$queryRawUnsafe<Array<{ studentId: string; scoreCount: bigint; average: string | null }>>(
      `SELECT sc."studentId",COUNT(*)::bigint AS "scoreCount",AVG(CASE WHEN sc."status"='excused' THEN NULL ELSE (sc."value" / NULLIF(a."maxScore",0) * 100) END)::text AS "average"
         FROM "Score" sc JOIN "Assessment" a ON a."id"=sc."assessmentId" AND a."schoolId"=sc."schoolId"
        WHERE sc."schoolId"=$1 AND a."termId"=$2 AND a."classId"=$3 GROUP BY sc."studentId"`, input.schoolId, selectedTerm.id, selectedClass.id),
    tx.$queryRawUnsafe<Array<{ studentId: string; present: bigint; absent: bigint; late: bigint }>>(
      `SELECT "studentId",COUNT(*) FILTER (WHERE "type"='in')::bigint AS "present",COUNT(*) FILTER (WHERE "type" IN ('absence','absent'))::bigint AS "absent",COUNT(*) FILTER (WHERE "isLate" IS TRUE)::bigint AS "late"
         FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "studentId" IS NOT NULL AND "attendanceDate" >= $2::date AND "attendanceDate" <= $3::date GROUP BY "studentId"`, input.schoolId, day(selectedTerm.startDate), day(selectedTerm.endDate)),
    tx.reportCard.findMany({ where: { schoolId: input.schoolId, termId: selectedTerm.id }, select: { studentId: true, status: true, remarks: true, headRemark: true } }),
    tx.$queryRawUnsafe<YearEnrollment[]>(
      `SELECT ye."id",ye."studentId",ye."frameworkId",ye."gradeLevelId",ye."pathwayId",ye."status",gl."name" AS "gradeName",gl."isTerminal",gl."pathwayRequired"
         FROM "StudentYearEnrollment" ye JOIN "GradeLevel" gl ON gl."id"=ye."gradeLevelId" AND gl."schoolId"=ye."schoolId"
        WHERE ye."schoolId"=$1 AND ye."academicYearId"=$2`, input.schoolId, selectedTerm.academicYearId),
    tx.$queryRawUnsafe<Array<{ fromGradeLevelId: string; outcome: "advance" | "complete" | "exit"; toGradeLevelId: string | null; targetPathwayId: string | null; targetGradeName: string | null }>>(
      `SELECT r."fromGradeLevelId",r."outcome",r."toGradeLevelId",r."targetPathwayId",g."name" AS "targetGradeName"
         FROM "GradeProgressionRule" r LEFT JOIN "GradeLevel" g ON g."id"=r."toGradeLevelId" AND g."schoolId"=r."schoolId"
        WHERE r."schoolId"=$1 AND r."isActive"=true AND r."isDefault"=true`, input.schoolId),
    tx.$queryRawUnsafe<Decision[]>(
      `SELECT d."id",d."studentId",d."outcome",d."status",d."reason",d."targetGradeLevelId",d."targetPathwayId",g."name" AS "targetGradeName",p."name" AS "targetPathwayName"
         FROM "PromotionDecision" d
         LEFT JOIN "GradeLevel" g ON g."id"=d."targetGradeLevelId" AND g."schoolId"=d."schoolId"
         LEFT JOIN "AcademicPathway" p ON p."id"=d."targetPathwayId" AND p."schoolId"=d."schoolId"
        WHERE d."schoolId"=$1 AND d."sourceAcademicYearId"=$2`, input.schoolId, selectedTerm.academicYearId),
    tx.$queryRawUnsafe<Array<{ id: string; frameworkId: string; name: string; code: string }>>(`SELECT "id","frameworkId","name","code" FROM "AcademicPathway" WHERE "schoolId"=$1 AND "isActive"=true ORDER BY "name"`, input.schoolId),
  ]);

  const assessments = Number(assessmentRows[0]?.count ?? 0);
  const scoreByStudent = new Map(scoreRows.map((item) => [item.studentId, item]));
  const attendanceByStudent = new Map(attendanceRows.map((item) => [item.studentId, item]));
  const reportByStudent = new Map(reports.map((item) => [item.studentId, item]));
  const yearByStudent = new Map(yearEnrollments.map((item) => [item.studentId, item]));
  const progressionByGrade = new Map(progressionRows.map((item) => [item.fromGradeLevelId, item as Progression]));
  const decisionByStudent = new Map(decisions.map((item) => [item.studentId, item]));
  const learners = roster.map((student) => {
    const score = scoreByStudent.get(student.studentId);
    const attendance = attendanceByStudent.get(student.studentId);
    const report = reportByStudent.get(student.studentId);
    const year = yearByStudent.get(student.studentId);
    const progression = year ? progressionByGrade.get(year.gradeLevelId) ?? null : null;
    const decision = decisionByStudent.get(student.studentId) ?? null;
    return {
      ...student,
      academic: { assessmentCount: assessments, scoreCount: Number(score?.scoreCount ?? 0), average: score?.average == null ? null : Number(score.average), missingScores: Math.max(0, assessments - Number(score?.scoreCount ?? 0)) },
      attendance: { present: Number(attendance?.present ?? 0), absent: Number(attendance?.absent ?? 0), late: Number(attendance?.late ?? 0) },
      reportCard: report ?? null,
      yearEnrollment: year ?? null,
      progression,
      decision,
      pathways: year ? pathways.filter((item) => item.frameworkId === year.frameworkId) : [],
    };
  });
  const pending = learners.filter((item) => policy?.isYearEnd && item.yearEnrollment && !item.decision).length;
  const drafts = learners.filter((item) => item.decision?.status === "draft").length;
  const confirmed = learners.filter((item) => ["confirmed", "applied"].includes(item.decision?.status ?? "")).length;
  return {
    classes,
    terms: terms.map((term) => ({ id: term.id, name: term.name, academicYearId: term.academicYearId, academicYearName: term.academicYear.name, startDate: term.startDate, endDate: term.endDate, isLocked: term.isLocked, policy: policyByTerm.get(term.id) ?? null })),
    selectedClass,
    selectedTerm: { id: selectedTerm.id, name: selectedTerm.name, academicYearId: selectedTerm.academicYearId, academicYearName: selectedTerm.academicYear.name, startDate: selectedTerm.startDate, endDate: selectedTerm.endDate, isLocked: selectedTerm.isLocked, policy },
    learners,
    summary: { learners: learners.length, assessments, pendingDecisions: pending, draftDecisions: drafts, confirmedDecisions: confirmed, yearEnd: Boolean(policy?.isYearEnd) },
  };
}

export async function submitClassTeacherPromotionDraft(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  classId: string;
  termId: string;
  studentId: string;
  outcome: ClassTeacherRecommendationOutcome;
  targetPathwayId?: string | null;
  reason?: string | null;
}) {
  const schoolClass = await assertClassTeacher(tx, input.schoolId, input.actorId, input.classId);
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, academicYearId: true, isLocked: true } });
  if (!term) throw new AppError("Academic term not found.", 404, "TERM_NOT_FOUND");
  if (term.isLocked) throw new AppError("This term is locked.", 409, "TERM_LOCKED");
  const policy = await sessionPolicy(tx, input.schoolId, input.termId);
  if (!policy?.isYearEnd) throw new AppError("Promotion recommendations are only available in the configured year-end session.", 409, "YEAR_END_SESSION_REQUIRED");
  if (policy.classTeacherReviewCloseAt && new Date() > policy.classTeacherReviewCloseAt) throw new AppError("The class-teacher year-end review window has closed.", 409, "CLASS_TEACHER_REVIEW_CLOSED");
  const enrollment = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Enrollment" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "studentId"=$4 AND "status" IN ('draft','ready','confirmed') LIMIT 1`, input.schoolId, input.termId, input.classId, input.studentId);
  if (!enrollment[0]) throw new AppError("This learner is not enrolled in your class for the selected term.", 409, "CLASS_TEACHER_LEARNER_SCOPE");
  const years = await tx.$queryRawUnsafe<YearEnrollment[]>(
    `SELECT ye."id",ye."studentId",ye."frameworkId",ye."gradeLevelId",ye."pathwayId",ye."status",gl."name" AS "gradeName",gl."isTerminal",gl."pathwayRequired" FROM "StudentYearEnrollment" ye JOIN "GradeLevel" gl ON gl."id"=ye."gradeLevelId" AND gl."schoolId"=ye."schoolId" WHERE ye."schoolId"=$1 AND ye."studentId"=$2 AND ye."academicYearId"=$3 LIMIT 1`,
    input.schoolId, input.studentId, term.academicYearId,
  );
  const year = years[0];
  if (!year) throw new AppError("Map this class into the Academic Structure before submitting promotion recommendations.", 409, "YEAR_ENROLLMENT_REQUIRED");
  const rules = await tx.$queryRawUnsafe<Progression[]>(
    `SELECT r."outcome",r."toGradeLevelId",r."targetPathwayId",g."name" AS "targetGradeName" FROM "GradeProgressionRule" r LEFT JOIN "GradeLevel" g ON g."id"=r."toGradeLevelId" AND g."schoolId"=r."schoolId" WHERE r."schoolId"=$1 AND r."fromGradeLevelId"=$2 AND r."isActive"=true AND r."isDefault"=true ORDER BY r."priority" LIMIT 1`,
    input.schoolId, year.gradeLevelId,
  );
  const rule = rules[0] ?? null;
  const reason = input.reason?.trim() || null;
  if (["retained", "deferred", "transferred", "withdrawn"].includes(input.outcome) && !reason) throw new AppError("A reason is required for this year-end recommendation.", 400, "PROMOTION_REASON_REQUIRED");
  let targetGradeLevelId: string | null = null;
  let targetPathwayId: string | null = null;
  if (input.outcome === "promoted") {
    if (!rule || rule.outcome !== "advance" || !rule.toGradeLevelId) throw new AppError("No default next grade is configured for this learner's level.", 409, "NO_PROGRESSION_RULE");
    targetGradeLevelId = rule.toGradeLevelId;
    targetPathwayId = input.targetPathwayId ?? rule.targetPathwayId ?? null;
    const targets = await tx.$queryRawUnsafe<Array<{ pathwayRequired: boolean }>>(`SELECT "pathwayRequired" FROM "GradeLevel" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, targetGradeLevelId);
    if (targets[0]?.pathwayRequired && !targetPathwayId) throw new AppError("Choose the learner's pathway/programme before recommending promotion.", 400, "PATHWAY_REQUIRED");
  } else if (input.outcome === "retained") {
    targetGradeLevelId = year.gradeLevelId;
    targetPathwayId = input.targetPathwayId ?? year.pathwayId;
  } else if (input.outcome === "graduated") {
    if (!year.isTerminal && rule?.outcome !== "complete") throw new AppError("Only a terminal level can be recommended for graduation/completion.", 409, "TERMINAL_LEVEL_REQUIRED");
  }
  if (targetPathwayId) {
    const path = await tx.$queryRawUnsafe<Array<{ frameworkId: string }>>(`SELECT "frameworkId" FROM "AcademicPathway" WHERE "schoolId"=$1 AND "id"=$2 AND "isActive"=true LIMIT 1`, input.schoolId, targetPathwayId);
    if (!path[0] || path[0].frameworkId !== year.frameworkId) throw new AppError("The selected pathway does not belong to the learner's academic framework.", 409, "ACADEMIC_FRAMEWORK_MISMATCH");
  }
  const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(`SELECT "id","status" FROM "PromotionDecision" WHERE "schoolId"=$1 AND "studentId"=$2 AND "sourceAcademicYearId"=$3 LIMIT 1`, input.schoolId, input.studentId, term.academicYearId);
  if (existing[0]?.status === "applied") throw new AppError("This learner's year-end decision has already been applied by rollover.", 409, "PROMOTION_ALREADY_APPLIED");
  const id = existing[0]?.id ?? createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "PromotionDecision" ("id","schoolId","studentId","frameworkId","sourceAcademicYearId","targetAcademicYearId","sourceGradeLevelId","targetGradeLevelId","targetPathwayId","outcome","status","reason","decidedBy") VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,'draft',$10,$11)
     ON CONFLICT ("schoolId","studentId","sourceAcademicYearId") DO UPDATE SET "targetGradeLevelId"=EXCLUDED."targetGradeLevelId","targetPathwayId"=EXCLUDED."targetPathwayId","outcome"=EXCLUDED."outcome","status"='draft',"reason"=EXCLUDED."reason","decidedBy"=EXCLUDED."decidedBy","decidedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
    id, input.schoolId, input.studentId, year.frameworkId, term.academicYearId, year.gradeLevelId, targetGradeLevelId, targetPathwayId, input.outcome, reason, input.actorId,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "class_teacher.promotion_recommendation_submitted", entityType: "PromotionDecision", entityId: id, after: { classId: schoolClass.id, termId: input.termId, studentId: input.studentId, outcome: input.outcome, targetGradeLevelId, targetPathwayId, status: "draft", reason } });
  return { id, status: "draft" as const, outcome: input.outcome, targetGradeLevelId, targetPathwayId };
}

export async function confirmClassTeacherPromotionDecision(tx: TenantDb, input: { schoolId: string; actorId: string; decisionId: string; targetAcademicYearId?: string | null }) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; studentId: string; sourceAcademicYearId: string; targetGradeLevelId: string | null; targetPathwayId: string | null; outcome: ClassTeacherRecommendationOutcome; reason: string | null; status: string }>>(
    `SELECT "id","studentId","sourceAcademicYearId","targetGradeLevelId","targetPathwayId","outcome","reason","status" FROM "PromotionDecision" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.decisionId,
  );
  const decision = rows[0];
  if (!decision) throw new AppError("Year-end recommendation not found.", 404, "PROMOTION_DECISION_NOT_FOUND");
  if (decision.status === "applied") throw new AppError("This decision has already been applied by rollover.", 409, "PROMOTION_ALREADY_APPLIED");
  return recordPromotionDecision(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    studentId: decision.studentId,
    sourceAcademicYearId: decision.sourceAcademicYearId,
    targetAcademicYearId: input.targetAcademicYearId ?? null,
    outcome: decision.outcome,
    targetGradeLevelId: decision.targetGradeLevelId,
    targetPathwayId: decision.targetPathwayId,
    reason: decision.reason,
  });
}
