import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { reportAttendanceForTerm } from "@/lib/report-card-attendance";
import { requirePermission } from "@/lib/rbac";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveStudentTermClass } from "@/lib/student-term-context";
import { recordPromotionDecision, resolveTermGradeContext } from "@/lib/academic-structure-service";
import { resolveYearEndAuthority } from "@/lib/academic-session-authority";
import { assertClassTeacherScope } from "@/lib/class-teacher-scope";

export type PromotionDecision = "promoted" | "not_promoted";

function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function configBoolean(raw: Record<string, Prisma.JsonValue>, key: string, fallback: boolean) {
  return typeof raw[key] === "boolean" ? Boolean(raw[key]) : fallback;
}

export function readManualPromotionDecision(value: Prisma.JsonValue | null | undefined): PromotionDecision | null {
  const raw = object(value);
  return raw.manualPromotionDecision === "promoted" || raw.manualPromotionDecision === "not_promoted" ? raw.manualPromotionDecision : null;
}

async function finalTermContext(tx: TenantDb, schoolId: string, termId: string) {
  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId },
    select: { reportCardConfig: true, reportCardTemplateId: true },
  });
  if (!settings) throw new AppError("Academic progression settings are incomplete.", 409, "PROMOTION_CONTEXT_INCOMPLETE");
  const config = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const authority = await resolveYearEndAuthority(tx, { schoolId, termId, legacyFinalTermNumber: config.finalTermNumber });
  return {
    config,
    authority,
    term: { id: authority.termId, academicYearId: authority.academicYearId, name: authority.termName },
    final: authority.isYearEnd ? { id: authority.termId, name: authority.termName } : null,
  };
}

async function freezeApprovedPresentation(tx: TenantDb, input: {
  schoolId: string;
  reportCardId: string;
  studentId: string;
  termId: string;
  calculationSnapshot: Prisma.JsonValue | null;
}): Promise<Prisma.JsonValue | null> {
  const [settings, term] = await Promise.all([
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: {
        reportCardConfig: true,
        reportCardTemplateId: true,
        showOverallPosition: true,
        showSubjectPosition: true,
        positionScope: true,
        behaviorRatingFields: true,
        reportCardWatermark: true,
      },
    }),
    tx.term.findFirst({
      where: { id: input.termId, schoolId: input.schoolId },
      select: { startDate: true, endDate: true },
    }),
  ]);
  if (!settings || !term) return input.calculationSnapshot;

  const raw = object(settings.reportCardConfig);
  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const attendance = await reportAttendanceForTerm(tx, {
    schoolId: input.schoolId,
    studentId: input.studentId,
    startDate: term.startDate,
    endDate: term.endDate,
  });
  const snapshot = object(input.calculationSnapshot);
  const reportPresentation = {
    showOverallPosition: Boolean(settings.showOverallPosition) && workflow.showOverallPosition && configBoolean(raw, "includePosition", true),
    showSubjectPosition: Boolean(settings.showSubjectPosition) && workflow.showSubjectPosition && configBoolean(raw, "includeSubjectPosition", true),
    showStudentPhoto: workflow.showStudentPhoto,
    showAttendance: workflow.showAttendance && configBoolean(raw, "includeAttendance", true),
    showPromotion: workflow.showPromotion,
    showClassTeacherRemark: workflow.showClassTeacherRemark && configBoolean(raw, "includeTeacherRemark", true),
    showHeadteacherRemark: workflow.showHeadteacherRemark && configBoolean(raw, "includeHeadRemark", true),
  };
  const nextSnapshot = {
    ...snapshot,
    reportPresentation,
    attendance: {
      presentDays: attendance.present,
      lateDays: attendance.late,
      expectedDays: attendance.expectedDays,
      absentDays: attendance.absent,
      attendanceRate: attendance.attendanceRate,
      totalRecorded: attendance.totalRecorded,
    },
    behaviorRatingFields: settings.behaviorRatingFields ?? null,
    watermark: settings.reportCardWatermark ?? "",
    presentationFrozenAt: new Date().toISOString(),
    positionScope: settings.positionScope === "year_group" ? "year_group" : "class",
  } as Prisma.InputJsonObject;

  await tx.reportCard.updateMany({
    where: { id: input.reportCardId, schoolId: input.schoolId, status: "approved" },
    data: { calculationSnapshot: nextSnapshot },
  });
  return nextSnapshot as unknown as Prisma.JsonValue;
}

async function recordStructuredPromotionIfMapped(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classId: string;
  decision: PromotionDecision;
}) {
  const gradeContext = await resolveTermGradeContext(tx, {
    schoolId: input.schoolId,
    studentId: input.studentId,
    termId: input.termId,
    classId: input.classId,
  });
  if (!gradeContext) return false;
  await recordPromotionDecision(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    studentId: input.studentId,
    sourceAcademicYearId: input.academicYearId,
    outcome: input.decision === "promoted" ? "promoted" : "retained",
  });
  return true;
}

export async function setReportPromotionDecision(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  reportCardId: string;
  decision: PromotionDecision;
}) {
  await requirePermission(tx, input.actorId, "report_cards:submit");
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportCardId, schoolId: input.schoolId },
    select: {
      id: true,
      termId: true,
      status: true,
      calculationSnapshot: true,
      student: { select: { id: true } },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (report.status !== "draft") throw new AppError("Promotion can only be decided before the report is submitted.", 409, "REPORT_LOCKED");
  const termClass = await resolveStudentTermClass(tx, { schoolId: input.schoolId, studentId: report.student.id, termId: report.termId });
  const historicalClass = await tx.class.findFirst({ where: { id: termClass.classId, schoolId: input.schoolId }, select: { id: true, name: true } });
  if (!historicalClass) throw new AppError("The learner's historical class is unavailable.", 409, "TERM_CLASS_NOT_FOUND");
  await assertClassTeacherScope(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    academicYearId: termClass.academicYearId,
    classId: historicalClass.id,
  });
  const context = await finalTermContext(tx, input.schoolId, report.termId);
  if (!context.final) {
    throw new AppError("Promotion decisions are only available in the configured year-end academic session.", 409, "NOT_FINAL_TERM");
  }
  const beforeDecision = readManualPromotionDecision(report.calculationSnapshot);
  const snapshot = object(report.calculationSnapshot);
  const nextSnapshot = {
    ...snapshot,
    classId: historicalClass.id,
    className: historicalClass.name,
    classSource: termClass.source,
    manualPromotionDecision: input.decision,
    promotionDecidedBy: input.actorId,
    promotionDecidedAt: new Date().toISOString(),
  } as Prisma.InputJsonObject;
  const changed = await tx.reportCard.updateMany({
    where: { id: report.id, schoolId: input.schoolId, status: "draft" },
    data: { calculationSnapshot: nextSnapshot },
  });
  if (changed.count !== 1) throw new AppError("The report changed state before promotion could be saved.", 409, "REPORT_LOCKED");
  const managedByYearRollover = await recordStructuredPromotionIfMapped(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    studentId: report.student.id,
    termId: report.termId,
    academicYearId: termClass.academicYearId,
    classId: historicalClass.id,
    decision: input.decision,
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "report_card.promotion_decided",
    entityType: "ReportCard",
    entityId: report.id,
    before: { decision: beforeDecision },
    after: { decision: input.decision, classId: historicalClass.id, termId: report.termId, progressionMode: managedByYearRollover ? "academic_year_rollover" : "legacy_class_progression", yearEndSource: context.authority.source },
  });
  return { reportCardId: report.id, decision: input.decision, finalTerm: context.final.name, progressionMode: managedByYearRollover ? "academic_year_rollover" as const : "legacy_class_progression" as const };
}

export async function applyApprovedPromotion(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  reportCardId: string;
}) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportCardId, schoolId: input.schoolId },
    select: {
      id: true,
      termId: true,
      status: true,
      calculationSnapshot: true,
      student: { select: { id: true, classId: true, name: true } },
    },
  });
  if (!report || report.status !== "approved") return { applied: false, reason: "not_applicable" as const };
  const termClass = await resolveStudentTermClass(tx, { schoolId: input.schoolId, studentId: report.student.id, termId: report.termId });

  const frozenSnapshot = await freezeApprovedPresentation(tx, {
    schoolId: input.schoolId,
    reportCardId: report.id,
    studentId: report.student.id,
    termId: report.termId,
    calculationSnapshot: report.calculationSnapshot,
  });
  const decision = readManualPromotionDecision(frozenSnapshot);
  if (!decision) return { applied: false, reason: "no_manual_decision" as const };

  const context = await finalTermContext(tx, input.schoolId, report.termId);
  if (!context.final) return { applied: false, reason: "not_final_term" as const };

  const managedByYearRollover = await recordStructuredPromotionIfMapped(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    studentId: report.student.id,
    termId: report.termId,
    academicYearId: termClass.academicYearId,
    classId: termClass.classId,
    decision,
  });
  if (managedByYearRollover) {
    return { applied: false, reason: "managed_by_year_rollover" as const };
  }

  if (decision !== "promoted") return { applied: false, reason: "not_promoted" as const };
  if (!context.config.autoApplyPromotion) return { applied: false, reason: "automatic_progression_disabled" as const };
  const targetClassId = context.config.classProgression[termClass.classId];
  if (!targetClassId) return { applied: false, reason: "next_class_not_configured" as const };
  if (targetClassId === termClass.classId) throw new AppError("The configured next class cannot be the learner's current class.", 409, "INVALID_CLASS_PROGRESSION");
  const target = await tx.class.findFirst({ where: { id: targetClassId, schoolId: input.schoolId }, select: { id: true, name: true } });
  if (!target) throw new AppError("The configured next class no longer exists.", 409, "INVALID_CLASS_PROGRESSION");
  const moved = await tx.student.updateMany({
    where: { id: report.student.id, schoolId: input.schoolId, classId: termClass.classId, status: "active" },
    data: { classId: target.id },
  });
  if (moved.count !== 1) return { applied: false, reason: "student_class_changed" as const };
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "student.promoted_from_report_card",
    entityType: "Student",
    entityId: report.student.id,
    before: { classId: termClass.classId },
    after: { classId: target.id, targetClass: target.name, reportCardId: report.id, sourceTermId: report.termId },
  });
  return { applied: true, targetClassId: target.id, targetClassName: target.name };
}
