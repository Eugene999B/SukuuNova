import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { gradeForPercentage, rankTotals, type GradeBand } from "@/lib/assessment-engine";
import { readManualPromotionDecision } from "@/lib/report-card-promotion";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

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
const round = (value: number, mode: ReportConfig["rounding"]) => mode === "down" ? Math.floor(value * 100) / 100 : mode === "up" ? Math.ceil(value * 100) / 100 : Math.round(value * 100) / 100;

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
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
    return [{ min, max, grade, label: typeof item.label === "string" ? item.label : undefined, remark: typeof item.remark === "string" ? item.remark : undefined }];
  }) : [];
  return scale.length ? scale : DEFAULT_SCALE;
}

type AssessmentRow = {
  id: string;
  name: string;
  type: string;
  maxScore: Prisma.Decimal;
  weight: Prisma.Decimal;
  scores: Array<{ studentId: string; value: Prisma.Decimal; status: string }>;
  subjectId: string;
};

function classify(type: string, config: ReportConfig) {
  const normalized = normalize(type);
  if (config.examTypes.includes(normalized)) return "exam" as const;
  if (config.classAssessmentTypes.includes(normalized)) return "ca" as const;
  return normalized.includes("exam") ? "exam" as const : "ca" as const;
}

function componentAverage(assessments: AssessmentRow[], studentId: string, kind: "ca" | "exam", config: ReportConfig) {
  const rows = assessments.filter((assessment) => classify(assessment.type, config) === kind);
  const percentages = rows.map((assessment) => {
    const score = assessment.scores.find((item) => item.studentId === studentId);
    if (!score || score.status === "excused") return config.missingScorePolicy === "zero" ? 0 : null;
    const max = Number(assessment.maxScore);
    const value = Number(score.value);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value) || value < 0 || value > max) {
      throw new AppError(`Invalid score data for ${assessment.name}.`, 409, "INVALID_SCORE_DATA");
    }
    return value / max * 100;
  }).filter((value): value is number => value != null);
  if (!percentages.length) return null;
  return percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
}

function subjectResult(assessments: AssessmentRow[], subjectId: string, studentId: string, config: ReportConfig, scale: GradeBand[]) {
  const rows = assessments.filter((assessment) => assessment.subjectId === subjectId);
  const caPercent = componentAverage(rows, studentId, "ca", config);
  const examPercent = componentAverage(rows, studentId, "exam", config);
  if (config.missingScorePolicy === "blank" && (caPercent == null || examPercent == null)) {
    return {
      ca: caPercent == null ? null : round(caPercent * config.classAssessmentWeight / 100, config.rounding),
      exam: examPercent == null ? null : round(examPercent * config.examWeight / 100, config.rounding),
      total: null,
      grade: null,
    };
  }
  const ca = caPercent == null ? 0 : caPercent * config.classAssessmentWeight / 100;
  const exam = examPercent == null ? 0 : examPercent * config.examWeight / 100;
  const total = round(ca + exam, config.rounding);
  return { ca: round(ca, config.rounding), exam: round(exam, config.rounding), total, grade: gradeForPercentage(total, scale) };
}

function passMark(scale: GradeBand[]) {
  const sorted = [...scale].sort((a, b) => a.min - b.min);
  return sorted.find((band) => typeof band.label === "string" && /pass/i.test(band.label))?.min ?? sorted.find((band) => band.min >= 40)?.min ?? 50;
}

function automaticPromotion(rule: string, overallPosition: number | null, rankedCount: number, cutoff: number, lines: Array<{ total: number | null }>, scale: GradeBand[]) {
  if (rule === "manual") return "decision_required" as const;
  if (rule === "pass_mark") return lines.length > 0 && lines.every((line) => (line.total ?? -1) >= passMark(scale)) ? "promoted" as const : "not_promoted" as const;
  const safe = Math.min(100, Math.max(1, Math.round(cutoff)));
  return overallPosition != null && overallPosition <= Math.ceil(rankedCount * safe / 100) ? "promoted" as const : "not_promoted" as const;
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
          classId: true,
          class: { select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } } },
        },
      },
    },
  });
  if (!report?.student.classId || !report.student.class) throw new AppError("Report card student has no class.", 409, "NO_CLASS");

  const [school, settings, term, assignments, activeStudents] = await Promise.all([
    tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: {
        gradeCaWeight: true,
        gradeExamWeight: true,
        gradingScale: true,
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
    tx.term.findUnique({ where: { id: report.termId }, select: { id: true, name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } }),
    tx.classSubjectTeacher.findMany({
      where: { schoolId: input.schoolId, classId: report.student.classId },
      select: { subjectId: true, subject: { select: { id: true, name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    tx.student.findMany({ where: { schoolId: input.schoolId, classId: report.student.classId, status: "active" }, select: { id: true, name: true } }),
  ]);
  if (!school || !settings || !term) throw new AppError("Report-card configuration is incomplete.", 409, "REPORT_CONTEXT_INCOMPLETE");

  const config = readReportCardConfig(settings.reportCardConfig, Number(settings.gradeCaWeight), Number(settings.gradeExamWeight));
  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const gradeScale = readGradeScale(settings.gradingScale);
  const visibleSubjects = assignments.map((assignment) => ({ id: assignment.subjectId, name: assignment.subject.name }));
  if (!visibleSubjects.length) throw new AppError("No subjects are assigned to this student's class.", 409, "NO_CLASS_SUBJECTS");

  const assessmentRows = await tx.assessment.findMany({
    where: { schoolId: input.schoolId, termId: report.termId, classId: report.student.classId, subjectId: { in: visibleSubjects.map((subject) => subject.id) } },
    select: { id: true, name: true, type: true, maxScore: true, weight: true, subjectId: true, scores: { select: { studentId: true, value: true, status: true } } },
    orderBy: [{ subject: { name: "asc" } }, { type: "asc" }, { name: "asc" }],
  });
  const rows: AssessmentRow[] = assessmentRows.map((assessment) => ({ ...assessment }));
  const results = visibleSubjects.map((subject) => ({ subjectId: subject.id, subject: subject.name, ...subjectResult(rows, subject.id, report.studentId, config, gradeScale) }));

  const studentSubjectTotals = new Map<string, Map<string, number>>();
  for (const student of activeStudents) {
    const subjectMap = new Map<string, number>();
    for (const subject of visibleSubjects) {
      const result = subjectResult(rows, subject.id, student.id, config, gradeScale);
      if (result.total != null) subjectMap.set(subject.id, result.total);
    }
    studentSubjectTotals.set(student.id, subjectMap);
  }

  const overallEntries = activeStudents.flatMap((student) => {
    const totals = [...(studentSubjectTotals.get(student.id)?.values() ?? [])];
    return totals.length === visibleSubjects.length ? [{ id: student.id, name: student.name, total: totals.reduce((a, b) => a + b, 0) / totals.length }] : [];
  });
  const overallPositions = rankTotals(overallEntries);
  const subjectPositions = new Map<string, Map<string, number>>();
  for (const subject of visibleSubjects) {
    const entries = activeStudents.flatMap((student) => {
      const total = studentSubjectTotals.get(student.id)?.get(subject.id);
      return total == null ? [] : [{ id: student.id, name: student.name, total }];
    });
    subjectPositions.set(subject.id, rankTotals(entries));
  }

  const studentTotals = [...(studentSubjectTotals.get(report.studentId)?.values() ?? [])];
  const allSubjectsComplete = studentTotals.length === visibleSubjects.length;
  const overallTotal = allSubjectsComplete && studentTotals.length ? round(studentTotals.reduce((a, b) => a + b, 0), config.rounding) : null;
  const average = allSubjectsComplete && studentTotals.length ? round(overallTotal! / studentTotals.length, config.rounding) : null;
  const overallPosition = overallPositions.get(report.studentId) ?? null;
  const rankedCount = overallEntries.length;
  const classSize = activeStudents.length;
  const resultLines = results.map((result) => ({ ...result, position: subjectPositions.get(result.subjectId)?.get(report.studentId) ?? null }));

  const snapshot = jsonObject(report.calculationSnapshot);
  const frozen = typeof snapshot.calculationVersion === "number" && Array.isArray(snapshot.assessments) && Boolean(snapshot.rankingFrozenAt);
  const finalPosition = frozen ? Number(snapshot.overallPosition ?? 0) || null : overallPosition;
  const finalResults = frozen && Array.isArray(snapshot.assessments) ? resultLines.map((row) => {
    const old = (snapshot.assessments as Prisma.JsonValue[]).find((entry) => typeof entry === "object" && entry && !Array.isArray(entry) && (entry as Record<string, Prisma.JsonValue>).subject === row.subject) as Record<string, Prisma.JsonValue> | undefined;
    const oldPosition = Array.isArray(snapshot.subjectPositions) ? (snapshot.subjectPositions as Prisma.JsonValue[]).find((entry) => typeof entry === "object" && entry && !Array.isArray(entry) && (entry as Record<string, Prisma.JsonValue>).subject === row.subject) as Record<string, Prisma.JsonValue> | undefined : null;
    return old ? {
      ...row,
      ca: typeof old.ca === "number" ? old.ca : row.ca,
      exam: typeof old.exam === "number" ? old.exam : row.exam,
      total: typeof old.total === "number" ? old.total : row.total,
      grade: typeof old.grade === "string" ? old.grade : row.grade,
      position: oldPosition && typeof oldPosition.position === "number" ? oldPosition.position : row.position,
    } : row;
  }) : resultLines;
  const frozenAssessmentTotals = frozen && Array.isArray(snapshot.assessments) ? (snapshot.assessments as Prisma.JsonValue[]).map((entry) => typeof entry === "object" && entry && !Array.isArray(entry) ? Number((entry as Record<string, Prisma.JsonValue>).total) : Number.NaN).filter(Number.isFinite) : [];
  const frozenTotal = typeof snapshot.overallTotal === "number" ? snapshot.overallTotal : frozenAssessmentTotals.length === visibleSubjects.length ? round(frozenAssessmentTotals.reduce((a, b) => a + b, 0), config.rounding) : overallTotal;
  const frozenAverage = typeof snapshot.average === "number" ? snapshot.average : frozenTotal != null && visibleSubjects.length ? round(frozenTotal / visibleSubjects.length, config.rounding) : average;
  const frozenGrade = typeof snapshot.overallGrade === "string" ? snapshot.overallGrade : gradeForPercentage(frozenAverage, gradeScale);
  const cutoff = Number(settings.positionPromotionCutoffPercent ?? 50);
  const livePromotion = automaticPromotion(settings.promotionRule, overallPosition, rankedCount, cutoff, resultLines.map((result) => ({ total: result.total })), gradeScale);
  const manualPromotion = readManualPromotionDecision(report.calculationSnapshot);
  const promotionDecision = frozen && (snapshot.promotionDecision === "promoted" || snapshot.promotionDecision === "not_promoted" || snapshot.promotionDecision === "decision_required")
    ? snapshot.promotionDecision
    : manualPromotion ?? livePromotion;

  const attendance = await tx.attendanceEvent.findMany({
    where: { schoolId: input.schoolId, studentId: report.studentId, type: "in", attendanceDate: { gte: term.startDate, lte: term.endDate } },
    select: { attendanceDate: true, isLate: true },
  });
  const presentDays = new Set(attendance.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size;
  const lateDays = attendance.filter((row) => row.isLate).length;
  const headRemarkValue = await headRemark(tx, input.schoolId, report.id);

  const frozenStudentName = frozen && typeof snapshot.studentName === "string" ? snapshot.studentName : report.student.name;
  const frozenAdmissionNo = frozen && typeof snapshot.admissionNo === "string" ? snapshot.admissionNo : report.student.admissionNo;
  const frozenPhotoUrl = frozen && (typeof snapshot.studentPhotoUrl === "string" || snapshot.studentPhotoUrl === null) ? snapshot.studentPhotoUrl as string | null : report.student.photoUrl;
  const frozenClassName = frozen && typeof snapshot.className === "string" ? snapshot.className : report.student.class.name;
  const frozenClassLevel = frozen && (typeof snapshot.classLevel === "string" || snapshot.classLevel === null) ? snapshot.classLevel as string | null : report.student.class.level;
  const frozenClassTeacherName = frozen && typeof snapshot.classTeacherName === "string" ? snapshot.classTeacherName : report.student.class.classTeacher?.name ?? "Class Teacher";
  const themeId = frozen && typeof snapshot.themeId === "string" ? snapshot.themeId : workflow.themeId;

  return {
    reportId: report.id,
    status: report.status,
    school,
    student: {
      id: report.student.id,
      name: frozenStudentName,
      admissionNo: frozenAdmissionNo,
      photoUrl: frozenPhotoUrl,
      classId: report.student.classId,
      className: frozenClassName,
      level: frozenClassLevel,
    },
    term: { ...term, academicYear: term.academicYear.name },
    gradingWeights: { ca: config.classAssessmentWeight, exam: config.examWeight },
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
      ...config,
      themeId,
      showOverallPosition: Boolean(settings.showOverallPosition) && workflow.showOverallPosition && config.showOverallPosition,
      showSubjectPosition: Boolean(settings.showSubjectPosition) && workflow.showSubjectPosition && config.showSubjectPosition,
      showStudentPhoto: workflow.showStudentPhoto && config.showStudentPhoto,
      showAttendance: workflow.showAttendance && config.showAttendance,
      showPromotion: workflow.showPromotion && config.showPromotion,
      showClassTeacherRemark: workflow.showClassTeacherRemark && config.showClassTeacherRemark,
      showHeadteacherRemark: workflow.showHeadteacherRemark && config.showHeadteacherRemark,
      behaviorRatingFields: settings.behaviorRatingFields,
      promotionRule: settings.promotionRule,
      positionPromotionCutoffPercent: cutoff,
      finalTermNumber: workflow.finalTermNumber,
      autoApplyPromotion: workflow.autoApplyPromotion,
    },
    watermark: settings.reportCardWatermark ?? "",
    classTeacherName: frozenClassTeacherName,
  };
}
