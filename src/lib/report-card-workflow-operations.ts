import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readManualPromotionDecision } from "@/lib/report-card-promotion";
import { submitReportCard } from "@/lib/report-card-service";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveYearEndAuthority } from "@/lib/academic-session-authority";

export type ReportWorkflowAction = "submit" | "approve" | "release";

/** Legacy helper kept for compatibility/tests. New workflow authority is AcademicSessionPolicy. */
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
    select: { id: true, studentId: true, termId: true, calculationSnapshot: true },
  });
  if (!report) throw new AppError("Report card not found.", 404, "NOT_FOUND");

  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId: input.schoolId },
    select: { reportCardConfig: true, reportCardTemplateId: true },
  });
  if (!settings) throw new AppError("Report-card workflow settings are incomplete.", 409, "REPORT_WORKFLOW_INCOMPLETE");

  const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  const authority = await resolveYearEndAuthority(tx, {
    schoolId: input.schoolId,
    termId: report.termId,
    legacyFinalTermNumber: workflow.finalTermNumber,
  });

  if (authority.isYearEnd) {
    const structured = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "PromotionDecision"
        WHERE "schoolId"=$1 AND "studentId"=$2 AND "sourceAcademicYearId"=$3
          AND "status" IN ('draft','confirmed','applied') LIMIT 1`,
      input.schoolId, report.studentId, authority.academicYearId,
    );
    const legacy = readManualPromotionDecision(report.calculationSnapshot);
    if (!structured[0] && !legacy) {
      throw new AppError(
        "The class teacher must record the learner's year-end promotion recommendation before this report can be submitted.",
        409,
        "PROMOTION_DECISION_REQUIRED",
      );
    }
  }
  return { isFinalTerm: authority.isYearEnd, finalTermNumber: workflow.finalTermNumber, yearEndSource: authority.source };
}

export async function submitReportCardForWorkflow(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; reportCardId: string },
) {
  await assertReportReadyForSubmission(tx, { schoolId: input.schoolId, reportCardId: input.reportCardId });
  return submitReportCard(tx, input);
}
