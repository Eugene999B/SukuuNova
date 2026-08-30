import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError, ForbiddenError } from "@/lib/errors";
import { getClassSubjectPerformance } from "@/lib/academic-engine";
import { gradeForPercentage } from "@/lib/assessment-engine";
import { hasPermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";

const query = z.object({ classId: z.string().min(1), subjectId: z.string().min(1), termId: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = query.parse(params);
    const result = await withTenant(session.schoolId, async (tx) => {
      const access = await getSchoolAuthorization(tx, session.userId);
      const canViewReports = await hasPermission(tx, session.userId, "report_cards:view");
      if (!canViewReports) throw new ForbiddenError("You do not have permission to view academic performance.");

      const canViewAll = await hasPermission(tx, session.userId, "scores:write:all") || await hasPermission(tx, session.userId, "reports:generate");
      if (!canViewAll) {
        const assigned = await tx.classSubjectTeacher.findFirst({ where: { teacherId: session.userId, classId: input.classId, subjectId: input.subjectId }, select: { id: true } });
        if (!assigned && access.isTeacher) throw new ForbiddenError("You can only view performance for classes and subjects assigned to you.");
      }

      const term = await tx.term.findUnique({ where: { id: input.termId }, select: { id: true } });
      const academicClass = await tx.class.findUnique({ where: { id: input.classId }, select: { id: true } });
      const subject = await tx.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } });
      if (!term || !academicClass || !subject) throw new ForbiddenError("The selected academic context was not found.");

      const data = await getClassSubjectPerformance(tx, input.classId, input.subjectId, input.termId);
      const ranked = data.rows
        .filter((row) => row.total != null)
        .sort((a, b) => Number(b.total) - Number(a.total));
      const positions = new Map<string, number>();
      let lastScore: number | null = null;
      let lastPosition = 0;
      ranked.forEach((row, index) => {
        const score = Number(row.total);
        if (lastScore !== score) lastPosition = index + 1;
        positions.set(row.student.id, lastPosition);
        lastScore = score;
      });
      const totals = ranked.map((row) => Number(row.total));
      const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
      const complete = data.rows.filter((row) => row.total != null).length;
      const gradeCounts = new Map<string, number>();
      for (const row of data.rows) {
        const grade = gradeForPercentage(row.total == null ? null : Number(row.total));
        if (grade) gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
      }
      return {
        ...data,
        summary: {
          classAverage: average == null ? null : Math.round(average * 100) / 100,
          highest: totals.length ? Math.max(...totals) : null,
          lowest: totals.length ? Math.min(...totals) : null,
          complete,
          incomplete: data.rows.length - complete,
          gradeDistribution: Object.fromEntries(gradeCounts)
        },
        rows: data.rows.map((row) => ({ ...row, position: positions.get(row.student.id) ?? null, grade: gradeForPercentage(row.total == null ? null : Number(row.total)) }))
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
