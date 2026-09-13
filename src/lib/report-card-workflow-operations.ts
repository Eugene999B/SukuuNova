import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readManualPromotionDecision } from "@/lib/report-card-promotion";
import { submitReportCard } from "@/lib/report-card-service";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

export type ReportWorkflowAction = "submit" | "approve" | "release";

export function isConfiguredFinalTerm(termId: string, orderedTermIds: string[], finalTermNumber: number) {
  if (!Number.isInteger(finalTermNumber) || finalTermNumber < 1) return false;
  return orderedTermIds[finalTermNumber - 1] === termId;
}

export function needsManualPromotionDecision(input: {
  isFinalTerm: boolean;
  calculationSnapshot: Prisma.JsonValue | null | undefined;
}) {
  return input.isFinalTerm && !readManualPromotionDecision(input.calculationSnapshot);
}

export function workflowStatusForAction(action: ReportWorkflowAction) {
  if (action === "submit") return "draft" as const;
  if (action === "approve") return "submitted" as const;
  return "approved" as const;
}

export async function assertReportReadyForSubmission(
  tx: TenantDb,
  input: { schoolId: string; reportCardId: string },
) {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportCardId, schoolId: input.schoolId },
    select: {
      id: true,
      termId: true,
      calculationSnapshot: true,
      term: { select: { academicYearId: true } },
    },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");

  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId: input.schoolId },
    select: { reportCardConfig: true, reportCardTemplateId: true },
  });
  if (!settings) throw new AppError("Report-card workflow settings are incomplete.", 409, "REPORT_WORKFLOW_INCOMPLETE");

  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const orderedTerms = await tx.term.findMany({
    where: { schoolId: input.schoolId, academicYearId: report.term.academicYearId },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    select: { id: true },
  });
  const isFinalTerm = isConfiguredFinalTerm(report.termId, orderedTerms.map((term) => term.id), workflow.finalTermNumber);
  if (needsManualPromotionDecision({ isFinalTerm, calculationSnapshot: report.calculationSnapshot })) {
    throw new AppError(
      "The class teacher must choose Promote or Do not promote before submitting the final-term report.",
      409,
      "PROMOTION_DECISION_REQUIRED",
    );
  }
  return { isFinalTerm, finalTermNumber: workflow.finalTermNumber };
}

export async function submitReportCardForWorkflow(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; reportCardId: string },
) {
  await assertReportReadyForSubmission(tx, { schoolId: input.schoolId, reportCardId: input.reportCardId });
  return submitReportCard(tx, input);
}
