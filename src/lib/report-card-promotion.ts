import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, ForbiddenError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

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
  const [settings, term] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { reportCardConfig: true, reportCardTemplateId: true } }),
    tx.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, academicYearId: true, name: true } }),
  ]);
  if (!settings || !term) throw new AppError("Academic progression settings are incomplete.", 409, "PROMOTION_CONTEXT_INCOMPLETE");
  const config = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const terms = await tx.term.findMany({
    where: { schoolId, academicYearId: term.academicYearId },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    select: { id: true, name: true },
  });
  const final = terms[config.finalTermNumber - 1] ?? null;
  return { config, term, final, terms };
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
  const attendanceRows = await tx.attendanceEvent.findMany({
    where: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      type: "in",
      attendanceDate: { gte: term.startDate, lte: term.endDate },
    },
    select: { attendanceDate: true, isLate: true },
  });
  const presentDays = new Set(attendanceRows.map((row) => row.attendanceDate.toISOString().slice(0, 10))).size;
  const lateDays = attendanceRows.filter((row) => row.isLate).length;
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
    attendance: { presentDays, lateDays },
    presentationFrozenAt: new Date().toISOString(),
    positionScope: settings.positionScope === "year_group" ? "year_group" : "class",
  } as Prisma.InputJsonObject;

  await tx.reportCard.updateMany({
    where: { id: input.reportCardId, schoolId: input.schoolId, status: "approved" },
    data: { calculationSnapshot: nextSnapshot },
  });
  return nextSnapshot as unknown as Prisma.JsonValue;
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
      student: { select: { id: true, classId: true, class: { select: { classTeacherId: true, name: true } } } },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");
  if (report.status !== "draft") throw new AppError("Promotion can only be decided before the report is submitted.", 409, "REPORT_LOCKED");
  if (!report.student.classId || report.student.class?.classTeacherId !== input.actorId) {
    throw new ForbiddenError("Only the learner's assigned class teacher can decide promotion.");
  }
  const context = await finalTermContext(tx, input.schoolId, report.termId);
  if (!context.final || context.final.id !== report.termId) {
    throw new AppError(`Promotion decisions are only available in configured final term ${context.config.finalTermNumber}.`, 409, "NOT_FINAL_TERM");
  }
  const beforeDecision = readManualPromotionDecision(report.calculationSnapshot);
  const snapshot = object(report.calculationSnapshot);
  const nextSnapshot = {
    ...snapshot,
    manualPromotionDecision: input.decision,
    promotionDecidedBy: input.actorId,
    promotionDecidedAt: new Date().toISOString(),
  } as Prisma.InputJsonObject;
  const changed = await tx.reportCard.updateMany({
    where: { id: report.id, schoolId: input.schoolId, status: "draft" },
    data: { calculationSnapshot: nextSnapshot },
  });
  if (changed.count !== 1) throw new AppError("The report changed state before promotion could be saved.", 409, "REPORT_LOCKED");
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "report_card.promotion_decided",
    entityType: "ReportCard",
    entityId: report.id,
    before: { decision: beforeDecision },
    after: { decision: input.decision, classId: report.student.classId, termId: report.termId },
  });
  return { reportCardId: report.id, decision: input.decision, finalTerm: context.final.name };
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
  if (!report || report.status !== "approved" || !report.student.classId) return { applied: false, reason: "not_applicable" as const };

  const frozenSnapshot = await freezeApprovedPresentation(tx, {
    schoolId: input.schoolId,
    reportCardId: report.id,
    studentId: report.student.id,
    termId: report.termId,
    calculationSnapshot: report.calculationSnapshot,
  });
  const decision = readManualPromotionDecision(frozenSnapshot);
  if (decision !== "promoted") return { applied: false, reason: decision === "not_promoted" ? "not_promoted" as const : "no_manual_decision" as const };

  const context = await finalTermContext(tx, input.schoolId, report.termId);
  if (!context.final || context.final.id !== report.termId) return { applied: false, reason: "not_final_term" as const };
  if (!context.config.autoApplyPromotion) return { applied: false, reason: "automatic_progression_disabled" as const };
  const targetClassId = context.config.classProgression[report.student.classId];
  if (!targetClassId) return { applied: false, reason: "next_class_not_configured" as const };
  if (targetClassId === report.student.classId) throw new AppError("The configured next class cannot be the learner's current class.", 409, "INVALID_CLASS_PROGRESSION");
  const target = await tx.class.findFirst({ where: { id: targetClassId, schoolId: input.schoolId }, select: { id: true, name: true } });
  if (!target) throw new AppError("The configured next class no longer exists.", 409, "INVALID_CLASS_PROGRESSION");
  const moved = await tx.student.updateMany({
    where: { id: report.student.id, schoolId: input.schoolId, classId: report.student.classId, status: "active" },
    data: { classId: target.id },
  });
  if (moved.count !== 1) return { applied: false, reason: "student_class_changed" as const };
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "student.promoted_from_report_card",
    entityType: "Student",
    entityId: report.student.id,
    before: { classId: report.student.classId },
    after: { classId: target.id, targetClass: target.name, reportCardId: report.id },
  });
  return { applied: true, targetClassId: target.id, targetClassName: target.name };
}
