import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  academicYearName: z.string().trim().min(3).max(80),
  academicYearStart: z.coerce.date(),
  academicYearEnd: z.coerce.date(),
  name: z.string().trim().min(2).max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
});

function status(start: Date, end: Date, now = new Date()) { return now < start ? "upcoming" : now > end ? "completed" : "current"; }

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const terms = await withTenant(session.schoolId, (tx) => tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: true }, orderBy: [{ startDate: "desc" }, { name: "asc" }] }));
    return NextResponse.json({ terms: terms.map((term) => ({ ...term, status: status(term.startDate, term.endDate) })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    if (input.academicYearEnd <= input.academicYearStart) throw new AppError("Academic year end must be after its start.", 400, "INVALID_YEAR_RANGE");
    if (input.endDate <= input.startDate) throw new AppError("Term end date must be after its start.", 400, "INVALID_TERM_RANGE");
    if (input.startDate < input.academicYearStart || input.endDate > input.academicYearEnd) throw new AppError("Term dates must sit inside the academic year.", 400, "TERM_OUTSIDE_YEAR");

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const year = await tx.academicYear.upsert({
        where: { schoolId_name: { schoolId: session.schoolId, name: input.academicYearName } },
        update: { startDate: input.academicYearStart, endDate: input.academicYearEnd },
        create: { schoolId: session.schoolId, name: input.academicYearName, startDate: input.academicYearStart, endDate: input.academicYearEnd }
      });
      const overlap = await tx.term.findFirst({ where: { schoolId: session.schoolId, academicYearId: year.id, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } } });
      if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");
      const term = await tx.term.create({ data: { schoolId: session.schoolId, academicYearId: year.id, name: input.name, startDate: input.startDate, endDate: input.endDate } });
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "academic.term_created", entityType: "Term", entityId: term.id, before: null, after: { term, academicYear: year } });
      return { year, term };
    });
    return NextResponse.json({ ok: true, ...result, status: status(result.term.startDate, result.term.endDate) });
  } catch (error) { return routeError(error); }
}
