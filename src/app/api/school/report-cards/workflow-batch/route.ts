import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";
import { submitReportCardForWorkflow, workflowStatusForAction, type ReportWorkflowAction } from "@/lib/report-card-workflow-operations";
import { resolveStudentTermClass } from "@/lib/student-term-context";

const BATCH_SIZE = 3;
const schema = z.object({
  termId: z.string().min(1).max(120),
  classId: z.string().min(1).max(120),
  action: z.enum(["submit", "approve", "release"]),
  skipReportIds: z.array(z.string().min(1).max(120)).max(250).default([]),
});

type FailedWorkflow = {
  reportCardId: string;
  studentName: string;
  admissionNo: string;
  message: string;
};

function appOrigin() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/g, "");
}

async function requireActionPermission(tx: TenantDb, actorId: string, action: ReportWorkflowAction) {
  if (action === "submit") return requirePermission(tx, actorId, "report_cards:submit");
  return requirePermission(tx, actorId, "report_cards:approve");
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const skipped = new Set(input.skipReportIds);
    const targetStatus = workflowStatusForAction(input.action);

    const scope = await withTenant(session.schoolId, async (tx) => {
      await requireActionPermission(tx, session.userId, input.action);
      const [term, schoolClass, reports] = await Promise.all([
        tx.term.findFirst({ where: { id: input.termId, schoolId: session.schoolId }, select: { id: true } }),
        tx.class.findFirst({ where: { id: input.classId, schoolId: session.schoolId }, select: { id: true } }),
        tx.reportCard.findMany({
          where: {
            schoolId: session.schoolId,
            termId: input.termId,
            status: targetStatus,
            id: skipped.size ? { notIn: [...skipped] } : undefined,
          },
          select: {
            id: true,
            studentId: true,
            createdAt: true,
            student: { select: { name: true, admissionNo: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      ]);
      if (!term) throw new AppError("The selected reporting term no longer exists.", 404, "TERM_NOT_FOUND");
      if (!schoolClass) throw new AppError("The selected class no longer exists.", 404, "CLASS_NOT_FOUND");

      const pending: typeof reports = [];
      for (const report of reports) {
        const context = await resolveStudentTermClass(tx, {
          schoolId: session.schoolId,
          studentId: report.studentId,
          termId: input.termId,
        });
        if (context.classId === input.classId) pending.push(report);
      }
      return { batch: pending.slice(0, BATCH_SIZE), pendingCount: pending.length };
    });

    if (!scope.batch.length) {
      return NextResponse.json(
        { action: input.action, succeeded: 0, attempted: 0, remaining: 0, failed: [] satisfies FailedWorkflow[] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    let succeeded = 0;
    const failed: FailedWorkflow[] = [];
    for (const report of scope.batch) {
      try {
        await withTenant(session.schoolId, async (tx) => {
          if (input.action === "submit") {
            await submitReportCardForWorkflow(tx, {
              schoolId: session.schoolId,
              actorId: session.userId,
              reportCardId: report.id,
            });
            return;
          }
          if (input.action === "approve") {
            await approveAndQueuePublicReportCard(tx, {
              schoolId: session.schoolId,
              actorId: session.userId,
              reportCardId: report.id,
              origin: appOrigin(),
            });
            return;
          }
          await sendApprovedReportCardPublic(tx, {
            schoolId: session.schoolId,
            actorId: session.userId,
            reportCardId: report.id,
            origin: appOrigin(),
          });
        });
        succeeded += 1;
      } catch (error) {
        failed.push({
          reportCardId: report.id,
          studentName: report.student.name,
          admissionNo: report.student.admissionNo,
          message: error instanceof Error ? error.message.slice(0, 220) : "This report could not advance to the next workflow stage.",
        });
      }
    }

    return NextResponse.json(
      {
        action: input.action,
        succeeded,
        attempted: scope.batch.length,
        remaining: Math.max(0, scope.pendingCount - scope.batch.length),
        failed,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
