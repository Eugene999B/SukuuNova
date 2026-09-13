import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { reportAttendanceForTerm } from "@/lib/report-card-attendance";
import { calculateIntelligentReportCard, readGradeScale, readReportCardConfig } from "@/lib/report-card-intelligence";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveStudentTermClass } from "@/lib/student-term-context";
import { liveReportDocumentContext, readSchoolDocumentIdentity, type SchoolDocumentIdentity, type ReportTraitValue, type StructuredPromotion } from "@/lib/report-card-v2";

export type FrozenPromotionDecision = "promoted" | "not_promoted" | "decision_required";

function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}
function numberOrNull(value: Prisma.JsonValue | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringOrNull(value: Prisma.JsonValue | undefined) { return typeof value === "string" ? value : null; }
function boolOr(value: Prisma.JsonValue | undefined, fallback: boolean) { return typeof value === "boolean" ? value : fallback; }
function frozenPromotionDecision(value: Prisma.JsonValue | undefined): FrozenPromotionDecision {
  if (value === "promoted" || value === "not_promoted" || value === "decision_required") return value;
  return "decision_required";
}
function identityFromSnapshot(value: Prisma.JsonValue | undefined, fallback: SchoolDocumentIdentity): SchoolDocumentIdentity {
  const raw = object(value);
  if (!Object.keys(raw).length) return fallback;
  const str = (key: keyof SchoolDocumentIdentity, fallbackValue: string | null = null) => typeof raw[key] === "string" ? String(raw[key]) : fallbackValue;
  return {
    name: str("name", fallback.name) ?? fallback.name,
    uniqueCode: str("uniqueCode", fallback.uniqueCode) ?? fallback.uniqueCode,
    logoUrl: raw.logoUrl === null ? null : str("logoUrl", fallback.logoUrl),
    brandColors: raw.brandColors === undefined ? fallback.brandColors : raw.brandColors,
    motto: str("motto", fallback.motto),
    postalAddress: str("postalAddress", fallback.postalAddress),
    physicalAddress: str("physicalAddress", fallback.physicalAddress),
    town: str("town", fallback.town),
    district: str("district", fallback.district),
    region: str("region", fallback.region),
    country: str("country", fallback.country) ?? fallback.country,
    email: str("email", fallback.email),
    phonePrimary: str("phonePrimary", fallback.phonePrimary),
    phoneSecondary: str("phoneSecondary", fallback.phoneSecondary),
    website: str("website", fallback.website),
    locationText: str("locationText", fallback.locationText),
    departmentName: str("departmentName", fallback.departmentName),
    identifierLabel: str("identifierLabel", fallback.identifierLabel) ?? fallback.identifierLabel,
    documentFooter: str("documentFooter", fallback.documentFooter),
  };
}
function traitsFromSnapshot(value: Prisma.JsonValue | undefined): ReportTraitValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, Prisma.JsonValue>;
    if (typeof row.label !== "string" || typeof row.value !== "string") return [];
    return [{
      fieldKey: typeof row.fieldKey === "string" ? row.fieldKey : row.label,
      label: row.label,
      value: row.value,
      displayOrder: typeof row.displayOrder === "number" ? row.displayOrder : 0,
    }];
  });
}
function promotionFromSnapshot(value: Prisma.JsonValue | undefined): StructuredPromotion | null {
  const raw = object(value);
  const outcome = raw.outcome;
  if (outcome !== "promoted" && outcome !== "retained" && outcome !== "graduated" && outcome !== "transferred" && outcome !== "withdrawn" && outcome !== "deferred") return null;
  return {
    outcome,
    status: typeof raw.status === "string" ? raw.status : "draft",
    reason: stringOrNull(raw.reason),
    targetGradeLevelId: stringOrNull(raw.targetGradeLevelId),
    targetGradeName: stringOrNull(raw.targetGradeName),
    targetPathwayId: stringOrNull(raw.targetPathwayId),
    targetPathwayName: stringOrNull(raw.targetPathwayName),
  };
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
      student: { select: { id: true, name: true, admissionNo: true, photoUrl: true } },
      term: { select: { id: true, name: true, startDate: true, endDate: true, academicYearId: true, academicYear: { select: { name: true } } } },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  const snapshot = object(report.calculationSnapshot);
  const frozen = Boolean(snapshot.rankingFrozenAt) && Array.isArray(snapshot.assessments);

  if (!frozen) {
    const [live, attendance, liveSettings, identity] = await Promise.all([
      calculateIntelligentReportCard(tx, input),
      reportAttendanceForTerm(tx, { schoolId: input.schoolId, studentId: report.student.id, startDate: report.term.startDate, endDate: report.term.endDate }),
      tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { gradingScale: true } }),
      readSchoolDocumentIdentity(tx, input.schoolId),
    ]);
    const context = await liveReportDocumentContext(tx, {
      schoolId: input.schoolId,
      reportId: report.id,
      studentId: report.student.id,
      termId: report.term.id,
      classId: live.student.classId,
    });
    return {
      ...live,
      school: identity,
      attendance,
      gradingScale: readGradeScale(context.gradingScale ?? liveSettings?.gradingScale),
      classRoll: context.classRoll,
      yearEndSession: context.yearEndSession,
      calendar: context.calendar,
      structuredPromotion: context.structuredPromotion,
      reportTraits: context.reportTraits,
      reportingPolicy: context.reportingPolicy,
      classTeacherName: context.classTeacherIdentity?.name ?? live.classTeacherName,
    };
  }

  const [liveIdentity, settings, termClassContext] = await Promise.all([
    readSchoolDocumentIdentity(tx, input.schoolId),
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: {
        gradeCaWeight: true, gradeExamWeight: true, gradingScale: true, reportCardTemplateId: true, reportCardConfig: true,
        showOverallPosition: true, showSubjectPosition: true, positionScope: true, behaviorRatingFields: true,
        promotionRule: true, positionPromotionCutoffPercent: true, reportCardWatermark: true,
      },
    }),
    resolveStudentTermClass(tx, { schoolId: input.schoolId, studentId: report.student.id, termId: report.term.id }),
  ]);
  if (!settings) throw new AppError("Report-card configuration is incomplete.", 409, "REPORT_CONTEXT_INCOMPLETE");
  const termClass = await tx.class.findFirst({
    where: { id: termClassContext.classId, schoolId: input.schoolId },
    select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } },
  });
  if (!termClass) throw new AppError("The historical class for this report card no longer exists.", 409, "REPORT_CLASS_MISSING");

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
      ca: numberOrNull(row.ca), exam: numberOrNull(row.exam), total: numberOrNull(row.total), grade: stringOrNull(row.grade),
      position: positionBySubject.get(subject) ?? null,
    }];
  });
  const grading = object(snapshot.gradingWeights);
  const frozenAttendance = object(snapshot.attendance);
  const promotionDecision: FrozenPromotionDecision = frozenPromotionDecision(snapshot.promotionDecision);
  const show = (key: string, fallback: boolean) => typeof presentation[key] === "boolean" ? Boolean(presentation[key]) : fallback;
  const positionScope: "class" | "year_group" = snapshot.positionScope === "year_group" || snapshot.positionScope === "class"
    ? snapshot.positionScope : settings.positionScope === "year_group" ? "year_group" : "class";
  const behaviorRatingFields = snapshot.behaviorRatingFields !== undefined ? snapshot.behaviorRatingFields : settings.behaviorRatingFields;
  const watermark = typeof snapshot.watermark === "string" ? snapshot.watermark : settings.reportCardWatermark ?? "";

  const calendarAttendance = await reportAttendanceForTerm(tx, { schoolId: input.schoolId, studentId: report.student.id, startDate: report.term.startDate, endDate: report.term.endDate });
  const present = numberOrNull(frozenAttendance.presentDays) ?? calendarAttendance.present;
  const late = numberOrNull(frozenAttendance.lateDays) ?? calendarAttendance.late;
  const expectedDays = numberOrNull(frozenAttendance.expectedDays) ?? calendarAttendance.expectedDays;
  const absent = numberOrNull(frozenAttendance.absentDays) ?? Math.max(0, expectedDays - present);
  const attendanceRate = numberOrNull(frozenAttendance.attendanceRate) ?? (expectedDays > 0 ? Math.round((present / expectedDays) * 1000) / 10 : null);
  const calendar = object(snapshot.calendar);
  const reportingPolicy = object(snapshot.reportingPolicy);
  const classTeacherIdentity = object(snapshot.classTeacherIdentity);

  return {
    reportId: report.id,
    status: report.status,
    school: identityFromSnapshot(snapshot.schoolIdentity, liveIdentity),
    student: {
      id: report.student.id,
      name: typeof snapshot.studentName === "string" ? snapshot.studentName : report.student.name,
      admissionNo: typeof snapshot.admissionNo === "string" ? snapshot.admissionNo : report.student.admissionNo,
      photoUrl: typeof snapshot.studentPhotoUrl === "string" || snapshot.studentPhotoUrl === null ? snapshot.studentPhotoUrl as string | null : report.student.photoUrl,
      classId: typeof snapshot.classId === "string" ? snapshot.classId : termClass.id,
      className: typeof snapshot.className === "string" ? snapshot.className : termClass.name,
      level: typeof snapshot.classLevel === "string" || snapshot.classLevel === null ? snapshot.classLevel as string | null : termClass.level,
    },
    term: { ...report.term, academicYear: report.term.academicYear.name },
    gradingWeights: { ca: typeof grading.ca === "number" ? grading.ca : Number(settings.gradeCaWeight), exam: typeof grading.exam === "number" ? grading.exam : Number(settings.gradeExamWeight) },
    gradingScale: readGradeScale(snapshot.gradingScale ?? settings.gradingScale),
    results,
    summary: { total: numberOrNull(snapshot.overallTotal), average: numberOrNull(snapshot.average), grade: stringOrNull(snapshot.overallGrade) },
    position: numberOrNull(snapshot.overallPosition),
    classSize: typeof snapshot.classSize === "number" ? snapshot.classSize : 0,
    classRoll: typeof snapshot.classRoll === "number" ? snapshot.classRoll : typeof snapshot.classSize === "number" ? snapshot.classSize : 0,
    rankedCount: typeof snapshot.rankedCount === "number" ? snapshot.rankedCount : 0,
    remarks: report.remarks ?? "",
    headRemark: report.headRemark,
    attendance: { present, late, expectedDays, absent, attendanceRate, totalRecorded: numberOrNull(frozenAttendance.totalRecorded) ?? calendarAttendance.totalRecorded },
    promotionDecision,
    structuredPromotion: promotionFromSnapshot(snapshot.structuredPromotion),
    yearEndSession: boolOr(snapshot.yearEndSession, false),
    calendar: {
      vacationDate: typeof calendar.vacationDate === "string" ? calendar.vacationDate : report.term.endDate,
      reopeningDate: typeof calendar.reopeningDate === "string" ? calendar.reopeningDate : null,
    },
    reportTraits: traitsFromSnapshot(snapshot.reportTraits),
    reportingPolicy: Object.keys(reportingPolicy).length ? { id: stringOrNull(reportingPolicy.id), version: numberOrNull(reportingPolicy.version), name: stringOrNull(reportingPolicy.name) } : null,
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
    classTeacherName: typeof classTeacherIdentity.name === "string" ? classTeacherIdentity.name : typeof snapshot.classTeacherName === "string" ? snapshot.classTeacherName : termClass.classTeacher?.name ?? "Class Teacher",
  };
}

/** Frozen report membership must never fall back to the learner's current class. */
export function reportBelongsToClass(calculationSnapshot: Prisma.JsonValue | null | undefined, _currentClassId: string | null, classId: string) {
  const snapshot = object(calculationSnapshot);
  const frozenClassId = typeof snapshot.classId === "string" ? snapshot.classId : null;
  return frozenClassId === classId;
}
