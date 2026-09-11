import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  calculateSubjectResult,
  gradeForPercentage,
  normalizeAssessmentType,
  rankTotals,
  type GradeBand,
} from "@/lib/assessment-engine";
import { getClassSubjectIntelligence } from "@/lib/performance-intelligence";
import {
  overallTotalsForScope,
  passMarkForScale,
  promotionForRule,
  rulesFor,
} from "@/lib/report-card-ranking";
import { readManualPromotionDecision } from "@/lib/report-card-promotion";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveStudentTermClass } from "@/lib/student-term-context";

type ReportConfig = {
  classAssessmentWeight: number;
  examWeight: number;
  classAssessmentTypes: string[];
  examTypes: string[];
  rounding: "nearest" | "down" | "up";
  missingScorePolicy: "blank" | "zero";
  showStudentPhoto: boolean;
  showOverallPosition: boolean;
  showSubjectPosition: boolean;
  showAttendance: boolean;
  showPromotion: boolean;
  showClassTeacherRemark: boolean;
  showHeadteacherRemark: boolean;
};

const DEFAULT_CA_TYPES = ["classwork", "ca", "exercise", "exercises", "homework", "participation", "quiz", "quizzes", "project", "assignment", "continuousassessment"];
const DEFAULT_EXAM_TYPES = ["exam", "examination", "finalexam", "terminalexam"];
const DEFAULT_SCALE: GradeBand[] = [
  { min: 80, max: 100, grade: "A", label: "Excellent" },
  { min: 70, max: 79.99, grade: "B", label: "Very Good" },
  { min: 60, max: 69.99, grade: "C", label: "Good" },
  { min: 50, max: 59.99, grade: "D", label: "Pass" },
  { min: 40, max: 49.99, grade: "E", label: "Needs Improvement" },
  { min: 0, max: 39.99, grade: "F", label: "Below Standard" },
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function round(value: number, mode: "nearest" | "down" | "up") {
  if (mode === "down") return Math.floor(value * 100) / 100;
  if (mode === "up") return Math.ceil(value * 100) / 100;
  return Math.round(value * 100) / 100;
}

function isExamCategory(value: string) {
  return normalizeAssessmentType(value).includes("exam");
}

async function headRemark(tx: TenantDb, schoolId: string, reportId: string) {
  const columns = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ReportCard' AND column_name='headRemark') AS "exists"`);
  if (!columns[0]?.exists) return null;
  const rows = await tx.$queryRawUnsafe<Array<{ headRemark: string | null }>>(`SELECT "headRemark" FROM "ReportCard" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, reportId, schoolId);
  return rows[0]?.headRemark ?? null;
}

export function readReportCardConfig(value: Prisma.JsonValue | null | undefined, caWeight = 30, examWeight = 70): ReportConfig {
  const raw = jsonObject(value);
  const ca = Number(raw.classAssessmentWeight ?? caWeight);
  const exam = Number(raw.examWeight ?? examWeight);
  const valid = Number.isFinite(ca) && Number.isFinite(exam) && ca >= 0 && exam >= 0 && Math.abs(ca + exam - 100) < 0.01;
  return {
    classAssessmentWeight: valid ? ca : caWeight,
    examWeight: valid ? exam : examWeight,
    classAssessmentTypes: Array.isArray(raw.classAssessmentTypes) ? raw.classAssessmentTypes.filter((x): x is string => typeof x === "string").map(normalize) : DEFAULT_CA_TYPES,
    examTypes: Array.isArray(raw.examTypes) ? raw.examTypes.filter((x): x is string => typeof x === "string").map(normalize) : DEFAULT_EXAM_TYPES,
    rounding: raw.rounding === "down" || raw.rounding === "up" ? raw.rounding : "nearest",
    missingScorePolicy: raw.missingScorePolicy === "zero" ? "zero" : "blank",
    showStudentPhoto: raw.showStudentPhoto !== false,
    showOverallPosition: raw.showOverallPosition !== false,
    showSubjectPosition: raw.showSubjectPosition !== false,
    showAttendance: raw.showAttendance !== false,
    showPromotion: raw.showPromotion !== false,
    showClassTeacherRemark: raw.showClassTeacherRemark !== false,
    showHeadteacherRemark: raw.showHeadteacherRemark !== false,
  };
}

export function readGradeScale(value: Prisma.JsonValue | null | undefined): GradeBand[] {
  const scale = Array.isArray(value) ? value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, Prisma.JsonValue>;
    const min = Number(item.min);
    const max = Number(item.max);
    const grade = typeof item.grade === "string" ? item.grade : "";
    if (!Number.isFinite(min) || !Number.isFinite(max) || !grade) return [];
    return [{
      min,
      max,
      grade,
      label: typeof item.label === "string" ? item.label : undefined,
      remark: typeof item.remark === "string" ? item.remark : undefined,
    }];
  }) : [];
  return scale.length ? scale : DEFAULT_SCALE;
}

type CanonicalAssessment = {
  id: string;
  name: string;
  type: string;
  maxScore: Prisma.Decimal;
  weight: Prisma.Decimal;
  subjectId: string;
  scores: Array<{ value: Prisma.Decimal; status: string }>;
};

function componentContribution(
  details: ReturnType<typeof calculateSubjectResult>["details"],
  component: "ca" | "exam",
  rounding: "nearest" | "down" | "up",
) {
  const buckets = new Map<string, { contribution: number; hasScore: boolean }>();
  for (const detail of details) {
    const exam = isExamCategory(detail.type);
    if ((component === "exam") !== exam) continue;
    const previous = buckets.get(detail.type);
    buckets.set(detail.type, {
      contribution: detail.contribution,
      hasScore: Boolean(previous?.hasScore || detail.rawScore != null),
    });
  }
  const scored = [...buckets.values()].filter((bucket) => bucket.hasScore);
  if (!scored.length) return null;
  return round(scored.reduce((sum, bucket) => sum + bucket.contribution, 0), rounding);
}

function subjectResult(assessments: CanonicalAssessment[], rules: ReturnType<typeof rulesFor>) {
  const result = calculateSubjectResult(
    assessments.map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      type: assessment.type,
      maxScore: assessment.maxScore,
      weight: assessment.weight,
      score: assessment.scores[0]?.value ?? null,
      status: assessment.scores[0]?.status ?? null,
    })),
    rules,
  );
  return {
    ca: componentContribution(result.details, "ca", rules.rounding),
    exam: componentContribution(result.details, "exam", rules.rounding),
    total: result.total,
  };
}

export async function calculateIntelligentReportCard(tx: TenantDb, input: { schoolId: string; reportId: string }) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportId, schoolId: input.schoolId },
    select: {
      id: true,
      studentId: true,
      termId: true,
      remarks: true,
      calculationSnapshot: true,
      status: true,
      student: {
        select: {
          id: true,
          name: true,
          admissionNo: true,
          photoUrl: true,
        },
      },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");

  const termClass = await resolveStudentTermClass(tx, { schoolId: input.schoolId, studentId: report.studentId, termId: report.termId });
  const historicalClass = await tx.class.findFirst({
    where: { id: termClass.classId, schoolId: input.schoolId },
    select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } },
  });
  if (!historicalClass) throw new AppError("The learner's class for this report term no longer exists.", 409, "TERM_CLASS_NOT_FOUND");

  const [school, settings, term, assignments] = await Promise.all([
    tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: {
        gradeCaWeight: true,
        gradeExamWeight: true,
        gradingScale: true,
        assessmentConfig: true,
        reportCardTemplateId: true,
        reportCardConfig: true,
        showOverallPosition: true,
        showSubjectPosition: true,
        positionScope: true,
        promotionRule: true,
        positionPromotionCutoffPercent: true,
        behaviorRatingFields: true,
        reportCardWatermark: true,
      },
    }),
    tx.term.findFirst({ where: { id: report.termId, schoolId: input.schoolId }, select: { id: true, name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } }),
    tx.classSubjectTeacher.findMany({
      where: { schoolId: input.schoolId, classId: historicalClass.id },
      select: { subjectId: true, subject: { select: { id: true, name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
  ]);
  if (!school || !settings || !term) throw new AppError("Report-card configuration is incomplete.", 409, "REPORT_CONTEXT_INCOMPLETE");

  const legacy = readReportCardConfig(settings.reportCardConfig, Number(settings.gradeCaWeight), Number(settings.gradeExamWeight));
  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const baseRules = rulesFor(settings);
  const effectiveScale = baseRules.gradingScale?.length ? baseRules.gradingScale : DEFAULT_SCALE;
  const rules = { ...baseRules, gradingScale: effectiveScale };
  const visibleSubjects = assignments.map((assignment) => ({ id: assignment.subjectId, name: assignment.subject.name }));
  if (!visibleSubjects.length) throw new AppError("No subjects are assigned to this learner's class for the report term.", 409, "NO_CLASS_SUBJECTS");

  const positionScope = settings.positionScope === "year_group" ? "year_group" as const : "class" as const;
  const scopeClassIds = positionScope === "year_group" && historicalClass.level
    ? (await tx.class.findMany({ where: { schoolId: input.schoolId, level: historicalClass.level }, select: { id: true } })).map((row) => row.id)
    : [historicalClass.id];

  const [assessmentRows, scopeTotals, subjectIntelligence, attendance, headRemarkValue] = await Promise.all([
    tx.assessment.findMany({
      where: {
        schoolId: input.schoolId,
        termId: report.termId,
        classId: historicalClass.id,
        subjectId: { in: visibleSubjects.map((subject) => subject.id) },
      },
      select: {
        id: true,
        name: true,
        type: true,
        maxScore: true,
        weight: true,
        subjectId: true,
        scores: { where: { studentId: report.studentId }, select: { value: true, status: true } },
      },
      orderBy: [{ subject: { name: "asc" } }, { type: "asc" }, { name: "asc" }],
    }),
    overallTotalsForScope(tx, { schoolId: input.schoolId, termId: report.termId, classIds: scopeClassIds, rules }),
    Promise.all(visibleSubjects.map(async (subject) => ({
      subjectId: subject.id,
      intelligence: await getClassSubjectIntelligence(tx, {
        classId: historicalClass.id,
        subjectId: subject.id,
        termId: report.termId,
        rules,
        scope: positionScope,
      }),
    }))),
    tx.attendanceEvent.findMany({
      where: { schoolId: input.schoolId, studentId: report.studentId, type: "in", attendanceDate: { gte: term.startDate, lte: term.endDate } },
      select: { attendanceDate: true, isLate: true },
    }),
    headRemark(tx, input.schoolId, report.id),
  ]);

  const assessments = assessmentRows as CanonicalAssessment[];
  const intelligenceBySubject = new Map(subjectIntelligence.map((entry) => [entry.subjectId, entry.intelligence]));
  const results = visibleSubjects.map((subject) => {
    const calculated = subjectResult(assessments.filter((assessment) => assessment.subjectId === subject.id), rules);
    const ranking = intelligenceBySubject.get(subject.id)?.rows.find((row) => row.studentId === report.studentId);
    return {
      subjectId: subject.id,
      subject: subject.name,
      ...calculated,
      grade: gradeForPercentage(calculated.total, effectiveScale),
      position: ranking?.position ?? null,
    };
  });

  const rankedPositions = rankTotals(
    [...scopeTotals.totals.entries()].map(([id, total]) => ({ id, name: scopeTotals.names.get(id) ?? "", total })),
  );
  const overallPosition = rankedPositions.get(report.studentId) ?? null;
  const rankedCount = scopeTotals.totals.size;
  const classSize = scopeTotals.names.size;
  const completeTotals = results.map((result) => result.total).filter((total): total is number => total != null);
  const allSubjectsComplete = completeTotals.length === results.length;
  const overallTotal = allSubjectsComplete && completeTotals.length ? round(completeTotals.reduce((sum, total) => sum + total, 0), rules.rounding) : null;
  const average = allSubjectsComplete && completeTotals.length ? round(overallTotal! / completeTotals.length, rules.rounding) : null;

  const snapshot = jsonObject(report.calculationSnapshot);
  const frozen = typeof snapshot.calculationVersion === "number" && Array.isArray(snapshot.assessments) && Boolean(snapshot.rankingFrozenAt);
  const frozenPositions = Array.isArray(snapshot.subjectPositions) ? snapshot.subjectPositions : [];
  const frozenPositionBySubject = new Map<string, number | null>();
  for (const entry of frozenPositions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, Prisma.JsonValue>;
    if (typeof row.subject === "string") frozenPositionBySubject.set(row.subject, typeof row.position === "number" ? row.position : null);
  }
  const finalResults = frozen && Array.isArray(snapshot.assessments)
    ? (snapshot.assessments as Prisma.JsonValue[]).flatMap((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const old = entry as Record<string, Prisma.JsonValue>;
        if (typeof old.subject !== "string") return [];
        const live = results.find((row) => row.subject === old.subject);
        return [{
          subjectId: live?.subjectId ?? `frozen-${index}`,
          subject: old.subject,
          ca: typeof old.ca === "number" ? old.ca : live?.ca ?? null,
          exam: typeof old.exam === "number" ? old.exam : live?.exam ?? null,
          total: typeof old.total === "number" ? old.total : live?.total ?? null,
          grade: typeof old.grade === "string" ? old.grade : live?.grade ?? null,
          position: frozenPositionBySubject.get(old.subject) ?? live?.position ?? null,
        }];
      })
    : results;

  const frozenTotal = frozen && typeof snapshot.overallTotal === "number" ? snapshot.overallTotal : overallTotal;
  const frozenAverage = frozen && typeof snapshot.average === "number" ? snapshot.average : average;
  const frozenGrade = frozen && typeof snapshot.overallGrade === "string" ? snapshot.overallGrade : gradeForPercentage(frozenAverage, effectiveScale);
  const finalPosition = frozen && typeof snapshot.overallPosition === "number" ? snapshot.overallPosition : overallPosition;
  const cutoff = Number(settings.positionPromotionCutoffPercent ?? 50);
  const promotionRule = settings.promotionRule === "pass_mark" || settings.promotionRule === "overall_position" ? settings.promotionRule : "manual";
  const livePromotion = promotionForRule(promotionRule, {
    overallPosition,
    rankedCount,
    cutoffPercent: cutoff,
    lines: results.map((result) => ({ total: result.total })),
    passMark: passMarkForScale(effectiveScale),
  });
  const manualPromotion = readManualPromotionDecision(report.calculationSnapshot);
  const promotionDecision = frozen && (snapshot.promotionDecision === "promoted" || snapshot.promotionDecision === "not_promoted" || snapshot.promotionDecision === "decision_required")
    ? snapshot.promotionDecision
    : manualPromotion ?? livePromotion;

  const livePresentDays = new Set(attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size;
  const liveLateDays = attendance.filter((row) => row.isLate).length;
  const frozenAttendance = frozen ? jsonObject(snapshot.attendance) : {};
  const presentDays = typeof frozenAttendance.presentDays === "number" ? frozenAttendance.presentDays : livePresentDays;
  const lateDays = typeof frozenAttendance.lateDays === "number" ? frozenAttendance.lateDays : liveLateDays;

  const frozenStudentName = frozen && typeof snapshot.studentName === "string" ? snapshot.studentName : report.student.name;
  const frozenAdmissionNo = frozen && typeof snapshot.admissionNo === "string" ? snapshot.admissionNo : report.student.admissionNo;
  const frozenPhotoUrl = frozen && (typeof snapshot.studentPhotoUrl === "string" || snapshot.studentPhotoUrl === null) ? snapshot.studentPhotoUrl as string | null : report.student.photoUrl;
  const frozenClassId = frozen && typeof snapshot.classId === "string" ? snapshot.classId : historicalClass.id;
  const frozenClassName = frozen && typeof snapshot.className === "string" ? snapshot.className : historicalClass.name;
  const frozenClassLevel = frozen && (typeof snapshot.classLevel === "string" || snapshot.classLevel === null) ? snapshot.classLevel as string | null : historicalClass.level;
  const frozenClassTeacherName = frozen && typeof snapshot.classTeacherName === "string" ? snapshot.classTeacherName : historicalClass.classTeacher?.name ?? "Class Teacher";
  const themeId = frozen && typeof snapshot.themeId === "string" ? snapshot.themeId : workflow.themeId;
  const presentation = frozen ? jsonObject(snapshot.reportPresentation) : {};
  const show = (key: string, fallback: boolean) => typeof presentation[key] === "boolean" ? Boolean(presentation[key]) : fallback;
  const canonicalCaWeight = rules.categories.filter((category) => !isExamCategory(category.name)).reduce((sum, category) => sum + category.weight, 0);
  const canonicalExamWeight = rules.categories.filter((category) => isExamCategory(category.name)).reduce((sum, category) => sum + category.weight, 0);

  return {
    reportId: report.id,
    status: report.status,
    school,
    student: {
      id: report.student.id,
      name: frozenStudentName,
      admissionNo: frozenAdmissionNo,
      photoUrl: frozenPhotoUrl,
      classId: frozenClassId,
      className: frozenClassName,
      level: frozenClassLevel,
    },
    term: { ...term, academicYear: term.academicYear.name },
    gradingWeights: { ca: canonicalCaWeight, exam: canonicalExamWeight },
    results: finalResults,
    summary: { total: frozenTotal, average: frozenAverage, grade: frozenGrade },
    position: finalPosition,
    classSize: frozen && typeof snapshot.classSize === "number" ? snapshot.classSize : classSize,
    rankedCount: frozen && typeof snapshot.rankedCount === "number" ? snapshot.rankedCount : rankedCount,
    remarks: report.remarks ?? "",
    headRemark: headRemarkValue,
    attendance: { present: presentDays, late: lateDays, totalRecorded: presentDays },
    promotionDecision,
    manualPromotionDecision: manualPromotion,
    reportSettings: {
      ...legacy,
      classAssessmentWeight: canonicalCaWeight,
      examWeight: canonicalExamWeight,
      themeId,
      positionScope: frozen && (snapshot.positionScope === "year_group" || snapshot.positionScope === "class") ? snapshot.positionScope : positionScope,
      showOverallPosition: show("showOverallPosition", Boolean(settings.showOverallPosition) && workflow.showOverallPosition && legacy.showOverallPosition),
      showSubjectPosition: show("showSubjectPosition", Boolean(settings.showSubjectPosition) && workflow.showSubjectPosition && legacy.showSubjectPosition),
      showStudentPhoto: show("showStudentPhoto", workflow.showStudentPhoto && legacy.showStudentPhoto),
      showAttendance: show("showAttendance", workflow.showAttendance && legacy.showAttendance),
      showPromotion: show("showPromotion", workflow.showPromotion && legacy.showPromotion),
      showClassTeacherRemark: show("showClassTeacherRemark", workflow.showClassTeacherRemark && legacy.showClassTeacherRemark),
      showHeadteacherRemark: show("showHeadteacherRemark", workflow.showHeadteacherRemark && legacy.showHeadteacherRemark),
      behaviorRatingFields: settings.behaviorRatingFields,
      promotionRule,
      positionPromotionCutoffPercent: cutoff,
      finalTermNumber: workflow.finalTermNumber,
      autoApplyPromotion: workflow.autoApplyPromotion,
    },
    watermark: settings.reportCardWatermark ?? "",
    classTeacherName: frozenClassTeacherName,
  };
}
