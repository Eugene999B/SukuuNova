import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { getClassSubjectPerformance } from "@/lib/academic-engine";
import { gradeForPercentage } from "@/lib/assessment-engine";
import { hasPermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { rankTotals } from "@/lib/report-card-ranking";

const query = z.object({ classId: z.string().min(1).max(100), subjectId: z.string().min(1).max(100), termId: z.string().min(1).max(100) });
const csv = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `\'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
const safeFilenamePart = (value: string) => value.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 40) || "export";

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const output = await withTenant(session.schoolId, async (tx) => {
      const access = await getSchoolAuthorization(tx, session.userId);
      const canViewReports = await hasPermission(tx, session.userId, "report_cards:view");
      if (!canViewReports) throw new ForbiddenError("You do not have permission to export academic performance.");
      const canViewAll = await hasPermission(tx, session.userId, "scores:write:all") || await hasPermission(tx, session.userId, "reports:generate");
      if (!canViewAll) {
        const assigned = await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, teacherId: session.userId, classId: input.classId, subjectId: input.subjectId } });
        if (!assigned && access.isTeacher) throw new ForbiddenError("You can only export performance for classes and subjects assigned to you.");
      }
      const data = await getClassSubjectPerformance(tx, input.classId, input.subjectId, input.termId);
      const positions = rankTotals(data.rows.filter((row) => row.total != null).map((row) => ({ id: row.student.id, name: row.student.name, total: Number(row.total) })));
      const scale = data.config.gradingScale?.length ? data.config.gradingScale : undefined;
      const headers = ["Admission No", "Student", ...data.assessments.flatMap((a) => [`${a.name} (${a.type})`, `${a.name} %`]), "Total", "Grade", "Position"];
      const lines = [headers.map(csv).join(",")];
      for (const row of data.rows) {
        const cells: unknown[] = [row.student.admissionNo, row.student.name];
        for (const score of row.scores) cells.push(score.rawScore ?? "", score.percentage == null ? "" : Number(score.percentage).toFixed(2));
        cells.push(row.total == null ? "" : Number(row.total).toFixed(2), gradeForPercentage(row.total == null ? null : Number(row.total), scale) ?? "", positions.get(row.student.id) ?? "");
        lines.push(cells.map(csv).join(","));
      }
      return { csv: lines.join("\n") };
    });
    const filename = `sukuunova-performance-${safeFilenamePart(input.classId)}-${safeFilenamePart(input.subjectId)}-${safeFilenamePart(input.termId)}.csv`;
    return new NextResponse(output.csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
