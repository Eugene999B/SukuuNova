import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const patchSchema = z.object({ name: z.string().trim().min(2).max(80), startDate: z.coerce.date(), endDate: z.coerce.date() });

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
      if (input.startDate < before.academicYear.startDate || input.endDate > before.academicYear.endDate) throw new AppError("Term dates must sit inside the academic year.", 400, "TERM_OUTSIDE_YEAR");
      const overlap = await tx.term.findFirst({ where: { schoolId: session.schoolId, academicYearId: before.academicYearId, id: { not: id }, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } } });
      if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");
      const updated = await tx.term.update({ where: { id }, data: input });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "academic.term_updated", entityType: "Term", entityId: id, before, after: updated });
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
      // Term summaries include finance and academic results, so require an explicit reporting capability rather than any authenticated school session.
      await requirePermission(tx, session.userId, "reports:generate");
      const term = await tx.term.findUnique({ where: { id }, include: { academicYear: true } });
      if (!term) throw new AppError("Term not found.", 404, "NOT_FOUND");
      const [students, assessments, scores, reportCards, attendance, invoices, payments] = await Promise.all([
        tx.student.count({ where: { status: "active" } }),
        tx.assessment.count({ where: { termId: id } }),
        tx.score.findMany({ where: { assessment: { termId: id } }, select: { value: true, assessment: { select: { maxScore: true } } } }),
        tx.reportCard.count({ where: { termId: id } }),
        tx.attendanceEvent.findMany({ where: { attendanceDate: { gte: term.startDate, lte: term.endDate } }, select: { type: true, isLate: true } }),
        tx.invoice.findMany({ where: { termId: id }, select: { id: true, totalAmount: true } }),
        tx.payment.findMany({ where: { invoice: { termId: id } }, select: { amount: true } })
      ]);
      const scorePct = scores.length ? scores.reduce((sum, s) => sum + Number(s.value) / Math.max(Number(s.assessment.maxScore), 1) * 100, 0) / scores.length : null;
      const present = attendance.filter((a) => a.type === "in").length;
      const late = attendance.filter((a) => Boolean(a.isLate)).length;
      const absent = attendance.filter((a) => a.type === "absence" || a.type === "absent").length;
      const invoiced = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
      const collected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return { term, status: termStatus(term.startDate, term.endDate), students, assessments, scores: scores.length, scorePct, reportCards, attendance: { records: attendance.length, present, late, absent }, finance: { invoiceCount: invoices.length, invoiced, collected, outstanding: Math.max(invoiced - collected, 0) } };
    });
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}
