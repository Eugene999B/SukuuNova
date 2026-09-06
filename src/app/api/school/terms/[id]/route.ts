import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError, ForbiddenError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isLocked: z.boolean().optional()
});

function termStatus(startDate: Date, endDate: Date, now = new Date()) {
  return now < startDate ? "upcoming" : now > endDate ? "completed" : "current";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const input = await parseJson(request, patchSchema);
    if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) throw new AppError("Term dates are invalid.", 400, "INVALID_TERM_DATE");
    if (input.endDate <= input.startDate) throw new AppError("Term end date must be after its start.", 400, "INVALID_TERM_RANGE");
    const term = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.term.findUnique({ where: { id }, include: { academicYear: true } });
      if (!before) throw new AppError("Term not found.", 404, "NOT_FOUND");
      const nextLocked = input.isLocked ?? before.isLocked;
      if (before.isLocked && !nextLocked) {
        const canReopen = await requirePermission(tx, session.userId, "academic:manage").then(() => true).catch(() => false);
        if (!canReopen) throw new ForbiddenError("Only an academic administrator can reopen a locked term.");
        const finalized = await tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id, status: { in: ["approved", "sent"] } } });
        if (finalized > 0) throw new AppError(`This term has ${finalized} finalized report card(s). Reopen is blocked to protect issued results.`, 409, "TERM_HAS_FINALIZED_REPORTS");
      }
      if (before.isLocked && (input.name !== before.name || input.startDate.getTime() !== before.startDate.getTime() || input.endDate.getTime() !== before.endDate.getTime())) {
        throw new AppError("A locked term cannot be edited. Reopen it first.", 409, "TERM_LOCKED");
      }
      if (input.startDate < before.academicYear.startDate || input.endDate > before.academicYear.endDate) throw new AppError("Term dates must sit inside the academic year.", 400, "TERM_OUTSIDE_YEAR");
      const overlap = await tx.term.findFirst({ where: { schoolId: session.schoolId, academicYearId: before.academicYearId, id: { not: id }, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } } });
      if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");
      const updated = await tx.term.update({ where: { id }, data: { name: input.name, startDate: input.startDate, endDate: input.endDate, isLocked: nextLocked } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: nextLocked !== before.isLocked ? (nextLocked ? "academic.term_locked" : "academic.term_reopened") : "academic.term_updated", entityType: "Term", entityId: id, before, after: updated });
      return updated;
    });
    return NextResponse.json({ ok: true, term, status: termStatus(term.startDate, term.endDate) });
  } catch (error) { return routeError(error); }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:generate");
      const term = await tx.term.findUnique({ where: { id }, include: { academicYear: true } });
      if (!term) throw new AppError("Term not found.", 404, "NOT_FOUND");
      // Aggregates are computed in SQL so a large term never loads every row.
      const [students, assessments, scoreAgg, reportCards, attendanceAgg, financeAgg] = await Promise.all([
        tx.student.count({ where: { schoolId: session.schoolId, status: "active" } }),
        tx.assessment.count({ where: { schoolId: session.schoolId, termId: id } }),
        tx.$queryRawUnsafe<Array<{ count: string; average: string | null }>>(
          `SELECT COUNT(*)::text AS "count", AVG("value" / NULLIF("maxScore", 0) * 100)::text AS "average"
           FROM (SELECT s."value", a."maxScore" FROM "Score" s JOIN "Assessment" a ON a."id" = s."assessmentId" AND a."schoolId" = s."schoolId"
           WHERE s."schoolId" = $1 AND a."termId" = $2) AS "term_scores"`,
          session.schoolId, id
        ),
        tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id } }),
        tx.$queryRawUnsafe<Array<{ records: string; present: string; late: string; absent: string }>>(
          `SELECT COUNT(*)::text AS "records",
            COUNT(*) FILTER (WHERE "type" = 'in')::text AS "present",
            COUNT(*) FILTER (WHERE "isLate" IS TRUE)::text AS "late",
            COUNT(*) FILTER (WHERE "type" IN ('absence', 'absent'))::text AS "absent"
           FROM "AttendanceEvent" WHERE "schoolId" = $1 AND "attendanceDate" >= $2 AND "attendanceDate" <= $3`,
          session.schoolId, term.startDate, term.endDate
        ),
        tx.$queryRawUnsafe<Array<{ invoices: string; invoiced: string; collected: string }>>(
          `SELECT COUNT(*)::text AS "invoices",
            COALESCE(SUM("totalAmount"), 0)::text AS "invoiced",
            COALESCE((SELECT SUM(p."amount" - COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."paymentId" = p."id" AND r."schoolId" = p."schoolId"), 0))
              FROM "Payment" p JOIN "Invoice" pi ON pi."id" = p."invoiceId" AND pi."schoolId" = p."schoolId"
              WHERE p."schoolId" = $1 AND pi."termId" = $2), 0)::text AS "collected"
           FROM "Invoice" i WHERE i."schoolId" = $1 AND i."termId" = $2`,
          session.schoolId, id
        ),
      ]);
      const scoreCount = Number(scoreAgg[0]?.count ?? 0);
      const scorePct = scoreAgg[0]?.average == null ? null : Number(scoreAgg[0].average);
      const attendance = { records: Number(attendanceAgg[0]?.records ?? 0), present: Number(attendanceAgg[0]?.present ?? 0), late: Number(attendanceAgg[0]?.late ?? 0), absent: Number(attendanceAgg[0]?.absent ?? 0) };
      const finance = { invoiceCount: Number(financeAgg[0]?.invoices ?? 0), invoiced: Number(financeAgg[0]?.invoiced ?? 0), collected: Number(financeAgg[0]?.collected ?? 0) };
      return { term, status: termStatus(term.startDate, term.endDate), students, assessments, scores: scoreCount, scorePct, reportCards, attendance, finance: { ...finance, outstanding: Math.max(finance.invoiced - finance.collected, 0) } };
    });
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}
