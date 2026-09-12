import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { termLifecycle } from "@/lib/term-date";

const schema = z.object({
  academicYearName: z.string().trim().min(3).max(80),
  academicYearStart: z.coerce.date(),
  academicYearEnd: z.coerce.date(),
  name: z.string().trim().min(2).max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  teachingWeeks: z.coerce.number().int().min(1).max(30).default(13),
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      const [terms, settings] = await Promise.all([
        tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: true }, orderBy: [{ startDate: "desc" }, { name: "asc" }] }),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      ]);
      const weeks = await tx.$queryRawUnsafe<Array<{ id: string; teachingWeeks: number }>>(`SELECT "id","teachingWeeks" FROM "Term" WHERE "schoolId"=$1`, session.schoolId);
      const weekMap = new Map(weeks.map((row) => [row.id, row.teachingWeeks]));
      const timezone = settings?.timezone || "Africa/Accra";
      return terms.map((term) => {
        const lifecycle = termLifecycle(term, new Date(), timezone);
        return {
          ...term,
          teachingWeeks: weekMap.get(term.id) ?? 13,
          status: lifecycle.state,
          needsFinalization: lifecycle.shouldPromptLock,
        };
      });
    });
    return NextResponse.json({ terms: result });
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-years:${session.schoolId}`}))`;
      const existingYear = await tx.academicYear.findUnique({ where: { schoolId_name: { schoolId: session.schoolId, name: input.academicYearName } } });
      if (existingYear && (existingYear.startDate.getTime() !== input.academicYearStart.getTime() || existingYear.endDate.getTime() !== input.academicYearEnd.getTime())) {
        throw new AppError(`${existingYear.name} already exists with different dates. Keep the existing year dates or create a new academic year.`, 409, "ACADEMIC_YEAR_DATES_MISMATCH");
      }
      const year = existingYear ?? await tx.academicYear.create({
        data: { schoolId: session.schoolId, name: input.academicYearName, startDate: input.academicYearStart, endDate: input.academicYearEnd }
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-year-terms:${session.schoolId}:${year.id}`}))`;
      const overlap = await tx.term.findFirst({ where: { schoolId: session.schoolId, academicYearId: year.id, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } } });
      if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");
      const term = await tx.term.create({ data: { schoolId: session.schoolId, academicYearId: year.id, name: input.name, startDate: input.startDate, endDate: input.endDate } });
      await tx.$executeRawUnsafe(`UPDATE "Term" SET "teachingWeeks"=$1 WHERE "id"=$2 AND "schoolId"=$3`, input.teachingWeeks, term.id, session.schoolId);
      const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } });
      const lifecycle = termLifecycle(term, new Date(), settings?.timezone || "Africa/Accra");
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "academic.term_created", entityType: "Term", entityId: term.id, before: null, after: { term, academicYear: year, teachingWeeks: input.teachingWeeks } });
      return { year, term: { ...term, teachingWeeks: input.teachingWeeks }, lifecycle };
    });
    return NextResponse.json({ ok: true, year: result.year, term: result.term, status: result.lifecycle.state });
  } catch (error) { return routeError(error); }
}
