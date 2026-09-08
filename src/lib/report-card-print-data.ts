import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { calculateIntelligentReportCard, readReportCardConfig } from "@/lib/report-card-intelligence";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

export type FrozenPromotionDecision = "promoted" | "not_promoted" | "decision_required";

function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function numberOrNull(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function frozenPromotionDecision(value: Prisma.JsonValue | undefined): FrozenPromotionDecision {
  if (value === "promoted" || value === "not_promoted" || value === "decision_required") return value;
  return "decision_required";
}

export async function getReportCardPrintData(tx: TenantDb, input: { schoolId: string; reportId: string }) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportId, schoolId: input.schoolId },
    select: {
      id: true,
      status: true,
      remarks: true,
      headRemark: true,
      calculationSnapshot: true,
      student: { select: { id: true, name: true, admissionNo: true, photoUrl: true, classId: true, class: { select: { name: true, level: true, classTeacher: { select: { name: true } } } } } },
      term: { select: { id: true, name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  const snapshot = object(report.calculationSnapshot);
  const frozen = Boolean(snapshot.rankingFrozenAt) && Array.isArray(snapshot.assessments);
  if (!frozen) return calculateIntelligentReportCard(tx, input);

  const [school, settings] = await Promise.all([
    tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: {
        gradeCaWeight: true,
        gradeExamWeight: true,
        reportCardTemplateId: true,
        reportCardConfig: true,
        showOverallPosition: true,
        showSubjectPosition: true,
        positionScope: true,
        behaviorRatingFields: true,
        promotionRule: true,
        positionPromotionCutoffPercent: true,
        reportCardWatermark: true,
      },
    }),
  ]);
  if (!school || !settings) throw new AppError("Report-card configuration is incomplete.", 409, "REPORT_CONTEXT_INCOMPLETE");

  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const legacy = readReportCardConfig(settings.reportCardConfig, Number(settings.gradeCaWeight), Number(settings.gradeExamWeight));
  const presentation = object(snapshot.reportPresentation);
  const positions = Array.isArray(snapshot.subjectPositions) ? snapshot.subjectPositions : [];
  const positionBySubject = new Map<string, number | null>();
  for (const raw of positions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, Prisma.JsonValue>;
    const subject = typeof row.subject === "string" ? row.subject : "";
    if (subject) positionBySubject.set(subject, numberOrNull(row.position));
  }
  const results = (snapshot.assessments as Prisma.JsonValue[]).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, Prisma.JsonValue>;
    const subject = typeof row.subject === "string" ? row.subject : "";
    if (!subject) return [];
    return [{
      subjectId: `frozen-${index}-${subject}`,
      subject,
      ca: numberOrNull(row.ca),
      exam: numberOrNull(row.exam),
      total: numberOrNull(row.total),
      grade: stringOrNull(row.grade),
      position: positionBySubject.get(subject) ?? null,
    }];
  });
  const grading = object(snapshot.gradingWeights);
  const attendance = object(snapshot.attendance);
  const promotionDecision: FrozenPromotionDecision = frozenPromotionDecision(snapshot.promotionDecision);
  const show = (key: string, fallback: boolean) => typeof presentation[key] === "boolean" ? Boolean(presentation[key]) : fallback;
  const positionScope: "class" | "year_group" = snapshot.positionScope === "year_group" || snapshot.positionScope === "class"
    ? snapshot.positionScope
    : settings.positionScope === "year_group" ? "year_group" : "class";
  const behaviorRatingFields = snapshot.behaviorRatingFields !== undefined
    ? snapshot.behaviorRatingFields
    : settings.behaviorRatingFields;
  const watermark = typeof snapshot.watermark === "string"
    ? snapshot.watermark
    : settings.reportCardWatermark ?? "";

  return {
    reportId: report.id,
    status: report.status,
    school,
    student: {
      id: report.student.id,
      name: typeof snapshot.studentName === "string" ? snapshot.studentName : report.student.name,
      admissionNo: typeof snapshot.admissionNo === "string" ? snapshot.admissionNo : report.student.admissionNo,
      photoUrl: typeof snapshot.studentPhotoUrl === "string" || snapshot.studentPhotoUrl === null ? snapshot.studentPhotoUrl as string | null : report.student.photoUrl,
      classId: typeof snapshot.classId === "string" ? snapshot.classId : report.student.classId,
      className: typeof snapshot.className === "string" ? snapshot.className : report.student.class?.name ?? "—",
      level: typeof snapshot.classLevel === "string" || snapshot.classLevel === null ? snapshot.classLevel as string | null : report.student.class?.level ?? null,
    },
    term: { ...report.term, academicYear: report.term.academicYear.name },
    gradingWeights: {
      ca: typeof grading.ca === "number" ? grading.ca : Number(settings.gradeCaWeight),
      exam: typeof grading.exam === "number" ? grading.exam : Number(settings.gradeExamWeight),
    },
    results,
    summary: { total: numberOrNull(snapshot.overallTotal), average: numberOrNull(snapshot.average), grade: stringOrNull(snapshot.overallGrade) },
    position: numberOrNull(snapshot.overallPosition),
    classSize: typeof snapshot.classSize === "number" ? snapshot.classSize : 0,
    rankedCount: typeof snapshot.rankedCount === "number" ? snapshot.rankedCount : 0,
    remarks: report.remarks ?? "",
    headRemark: report.headRemark,
    attendance: {
      present: typeof attendance.presentDays === "number" ? attendance.presentDays : 0,
      late: typeof attendance.lateDays === "number" ? attendance.lateDays : 0,
      totalRecorded: typeof attendance.presentDays === "number" ? attendance.presentDays : 0,
    },
    promotionDecision,
    manualPromotionDecision: snapshot.manualPromotionDecision === "promoted" || snapshot.manualPromotionDecision === "not_promoted" ? snapshot.manualPromotionDecision : null,
    reportSettings: {
      ...legacy,
      themeId: typeof snapshot.themeId === "string" ? snapshot.themeId : workflow.themeId,
      positionScope,
      showOverallPosition: show("showOverallPosition", Boolean(settings.showOverallPosition) && workflow.showOverallPosition && legacy.showOverallPosition),
      showSubjectPosition: show("showSubjectPosition", Boolean(settings.showSubjectPosition) && workflow.showSubjectPosition && legacy.showSubjectPosition),
      showStudentPhoto: show("showStudentPhoto", workflow.showStudentPhoto && legacy.showStudentPhoto),
      showAttendance: show("showAttendance", workflow.showAttendance && legacy.showAttendance),
      showPromotion: show("showPromotion", workflow.showPromotion && legacy.showPromotion),
      showClassTeacherRemark: show("showClassTeacherRemark", workflow.showClassTeacherRemark && legacy.showClassTeacherRemark),
      showHeadteacherRemark: show("showHeadteacherRemark", workflow.showHeadteacherRemark && legacy.showHeadteacherRemark),
      behaviorRatingFields,
      promotionRule: typeof snapshot.promotionRule === "string" ? snapshot.promotionRule : settings.promotionRule,
      positionPromotionCutoffPercent: Number(settings.positionPromotionCutoffPercent ?? 50),
      finalTermNumber: workflow.finalTermNumber,
      autoApplyPromotion: workflow.autoApplyPromotion,
    },
    watermark,
    classTeacherName: typeof snapshot.classTeacherName === "string" ? snapshot.classTeacherName : report.student.class?.classTeacher?.name ?? "Class Teacher",
  };
}

export function reportBelongsToClass(calculationSnapshot: Prisma.JsonValue | null | undefined, currentClassId: string | null, classId: string) {
  const snapshot = object(calculationSnapshot);
  const frozenClassId = typeof snapshot.classId === "string" ? snapshot.classId : null;
  return (frozenClassId ?? currentClassId) === classId;
}
