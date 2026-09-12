import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { termLifecycle } from "@/lib/term-date";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  teachingWeeks: z.coerce.number().int().min(1).max(30).optional(),
  isLocked: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const input = await parseJson(request, patchSchema);
    if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) throw new AppError("Term dates are invalid.", 400, "INVALID_TERM_DATE");
    if (input.endDate <= input.startDate) throw new AppError("Term end date must be after its start.", 400, "INVALID_TERM_RANGE");

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.term.findUnique({ where: { id }, include: { academicYear: true } });
      if (!before) throw new AppError("Term not found.", 404, "NOT_FOUND");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-year-terms:${session.schoolId}:${before.academicYearId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`term-mutation:${session.schoolId}:${id}`}))`;
      const current = await tx.term.findUnique({ where: { id }, include: { academicYear: true } });
      if (!current) throw new AppError("Term not found.", 404, "NOT_FOUND");
      const [weekRows, settings] = await Promise.all([
        tx.$queryRawUnsafe<Array<{ teachingWeeks: number }>>(`SELECT "teachingWeeks" FROM "Term" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, id),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      ]);
      const currentWeeks = weekRows[0]?.teachingWeeks ?? 13;
      const nextWeeks = input.teachingWeeks ?? currentWeeks;
      const nextLocked = input.isLocked ?? current.isLocked;

      if (current.isLocked && !nextLocked) {
        await requirePermission(tx, session.userId, "calendar:manage");
        const finalized = await tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id, status: { in: ["approved", "sent"] } } });
        if (finalized > 0) throw new AppError(`This term has ${finalized} finalized report card(s). Reopen is blocked to protect issued results.`, 409, "TERM_HAS_FINALIZED_REPORTS");
      }
      const changingLockedTerm = input.name !== current.name || input.startDate.getTime() !== current.startDate.getTime() || input.endDate.getTime() !== current.endDate.getTime() || nextWeeks !== currentWeeks;
      if (current.isLocked && changingLockedTerm) throw new AppError("A locked term cannot be edited. Reopen it first.", 409, "TERM_LOCKED");
      if (input.startDate < current.academicYear.startDate || input.endDate > current.academicYear.endDate) throw new AppError("Term dates must sit inside the academic year.", 400, "TERM_OUTSIDE_YEAR");
      const overlap = await tx.term.findFirst({ where: { schoolId: session.schoolId, academicYearId: current.academicYearId, id: { not: id }, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } } });
      if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");

      const updated = await tx.term.update({ where: { id }, data: { name: input.name, startDate: input.startDate, endDate: input.endDate, isLocked: nextLocked } });
      if (nextWeeks !== currentWeeks) await tx.$executeRawUnsafe(`UPDATE "Term" SET "teachingWeeks"=$1 WHERE "id"=$2 AND "schoolId"=$3`, nextWeeks, id, session.schoolId);

      const approvedReportCardsAwaitingRelease = !current.isLocked && nextLocked
        ? await tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id, status: "approved" } })
        : 0;
      const lifecycle = termLifecycle(updated, new Date(), settings?.timezone || "Africa/Accra");

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: nextLocked !== current.isLocked ? (nextLocked ? "academic.term_locked" : "academic.term_reopened") : "academic.term_updated",
        entityType: "Term",
        entityId: id,
        before: { ...current, teachingWeeks: currentWeeks },
        after: { ...updated, teachingWeeks: nextWeeks, approvedReportCardsAwaitingRelease, reportReleaseStatusPreserved: true },
      });
      return { term: { ...updated, teachingWeeks: nextWeeks }, approvedReportCardsAwaitingRelease, lifecycle };
    });

    return NextResponse.json({ ok: true, term: result.term, approvedReportCardsAwaitingRelease: result.approvedReportCardsAwaitingRelease, status: result.lifecycle.state, needsFinalization: result.lifecycle.shouldPromptLock });
  } catch (error) {
    return routeError(error);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await context.params;
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      const [canViewFinance, canExportFinance, canExportAttendance, canExportLessonPlans, canExportAcademic] = await Promise.all([
        hasPermission(tx, session.userId, "finance:read"),
        hasPermission(tx, session.userId, "exports:finance"),
        hasPermission(tx, session.userId, "exports:attendance"),
        hasPermission(tx, session.userId, "lesson_plans:review"),
        hasPermission(tx, session.userId, "reports:generate"),
      ]);
      const [term, settings] = await Promise.all([
        tx.term.findUnique({ where: { id }, include: { academicYear: true } }),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      ]);
      if (!term) throw new AppError("Term not found.", 404, "NOT_FOUND");
      const weekRows = await tx.$queryRawUnsafe<Array<{ teachingWeeks: number }>>(`SELECT "teachingWeeks" FROM "Term" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, id);
      const teachingWeeks = weekRows[0]?.teachingWeeks ?? 13;
      const lifecycle = termLifecycle(term, new Date(), settings?.timezone || "Africa/Accra");

      const [students, assessments, scoreAgg, reportCards, approvedReports, sentReports, attendanceAgg, lessonAgg, teachingAssignments] = await Promise.all([
        tx.student.count({ where: { schoolId: session.schoolId, status: "active" } }),
        tx.assessment.count({ where: { schoolId: session.schoolId, termId: id } }),
        tx.$queryRawUnsafe<Array<{ count: string; average: string | null }>>(`SELECT COUNT(*)::text AS "count", AVG("value" / NULLIF("maxScore", 0) * 100)::text AS "average" FROM (SELECT s."value", a."maxScore" FROM "Score" s JOIN "Assessment" a ON a."id" = s."assessmentId" AND a."schoolId" = s."schoolId" WHERE s."schoolId" = $1 AND a."termId" = $2) AS "term_scores"`, session.schoolId, id),
        tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id } }),
        tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id, status: "approved" } }),
        tx.reportCard.count({ where: { schoolId: session.schoolId, termId: id, status: "sent" } }),
        tx.$queryRawUnsafe<Array<{ records: string; present: string; late: string; absent: string }>>(`SELECT COUNT(*)::text AS "records", COUNT(*) FILTER (WHERE "type" = 'in')::text AS "present", COUNT(*) FILTER (WHERE "isLate" IS TRUE)::text AS "late", COUNT(*) FILTER (WHERE "type" IN ('absence', 'absent'))::text AS "absent" FROM "AttendanceEvent" WHERE "schoolId" = $1 AND "attendanceDate" >= $2 AND "attendanceDate" <= $3`, session.schoolId, term.startDate, term.endDate),
        tx.$queryRawUnsafe<Array<{ total: string; submitted: string; approved: string; changesRequested: string }>>(`SELECT COUNT(*)::text AS "total", COUNT(*) FILTER (WHERE "status"='submitted')::text AS "submitted", COUNT(*) FILTER (WHERE "status" IN ('approved','completed','archived'))::text AS "approved", COUNT(*) FILTER (WHERE "status"='changes_requested')::text AS "changesRequested" FROM "LessonPlan" WHERE "schoolId"=$1 AND "termId"=$2`, session.schoolId, id),
        tx.classSubjectTeacher.count({ where: { schoolId: session.schoolId } }),
      ]);

      const scoreCount = Number(scoreAgg[0]?.count ?? 0);
      const scorePct = scoreAgg[0]?.average == null ? null : Number(scoreAgg[0].average);
      const attendance = { records: Number(attendanceAgg[0]?.records ?? 0), present: Number(attendanceAgg[0]?.present ?? 0), late: Number(attendanceAgg[0]?.late ?? 0), absent: Number(attendanceAgg[0]?.absent ?? 0) };
      const lesson = lessonAgg[0];
      const lessonPlans = {
        total: Number(lesson?.total ?? 0),
        submitted: Number(lesson?.submitted ?? 0),
        approved: Number(lesson?.approved ?? 0),
        changesRequested: Number(lesson?.changesRequested ?? 0),
        expected: teachingAssignments * teachingWeeks,
      };
      let finance: { invoiceCount: number; invoiced: number; collected: number; outstanding: number } | null = null;
      if (canViewFinance) {
        const financeAgg = await tx.$queryRawUnsafe<Array<{ invoices: string; invoiced: string; collected: string }>>(`SELECT COUNT(*)::text AS "invoices", COALESCE(SUM("totalAmount"), 0)::text AS "invoiced", COALESCE((SELECT SUM(p."amount" - COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."paymentId" = p."id" AND r."schoolId" = p."schoolId"), 0)) FROM "Payment" p JOIN "Invoice" pi ON pi."id" = p."invoiceId" AND pi."schoolId" = p."schoolId" WHERE p."schoolId" = $1 AND pi."termId" = $2), 0)::text AS "collected" FROM "Invoice" i WHERE i."schoolId" = $1 AND i."termId" = $2`, session.schoolId, id);
        const row = financeAgg[0];
        const invoiced = Number(row?.invoiced ?? 0);
        const collected = Number(row?.collected ?? 0);
        finance = { invoiceCount: Number(row?.invoices ?? 0), invoiced, collected, outstanding: Math.max(invoiced - collected, 0) };
      }

      return {
        term: { ...term, teachingWeeks },
        status: lifecycle.state,
        needsFinalization: lifecycle.shouldPromptLock,
        students,
        assessments,
        scores: scoreCount,
        scorePct,
        reportCards,
        reportCardReadiness: { generated: reportCards, approved: approvedReports, released: sentReports, expected: students },
        attendance,
        lessonPlans,
        finance,
        capabilities: { canViewFinance, canExportFinance, canExportAttendance, canExportLessonPlans, canExportAcademic },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
