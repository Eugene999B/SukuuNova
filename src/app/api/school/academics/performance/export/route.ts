import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getClassSubjectPerformance } from "@/lib/academic-engine";
import { gradeForPercentage } from "@/lib/assessment-engine";

const query = z.object({ classId: z.string().min(1), subjectId: z.string().min(1), termId: z.string().min(1) });
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const output = await withTenant(session.schoolId, async (tx) => {
      const data = await getClassSubjectPerformance(tx, input.classId, input.subjectId, input.termId);
      const ranked = data.rows.filter((row) => row.total != null).sort((a, b) => Number(b.total) - Number(a.total));
      const positions = new Map<string, number>();
      let previous: number | null = null;
      let position = 0;
      ranked.forEach((row, index) => {
        const score = Number(row.total);
        if (previous !== score) position = index + 1;
        positions.set(row.student.id, position);
        previous = score;
      });
      const headers = ["Admission No", "Student", ...data.assessments.flatMap((a) => [`${a.name} (${a.type})`, `${a.name} %`]), "Total", "Grade", "Position"];
      const lines = [headers.map(csv).join(",")];
      for (const row of data.rows) {
        const cells: unknown[] = [row.student.admissionNo, row.student.name];
        for (const score of row.scores) cells.push(score.rawScore ?? "", score.percentage == null ? "" : Number(score.percentage).toFixed(2));
        cells.push(row.total == null ? "" : Number(row.total).toFixed(2), gradeForPercentage(row.total == null ? null : Number(row.total)) ?? "", positions.get(row.student.id) ?? "");
        lines.push(cells.map(csv).join(","));
      }
      return { csv: lines.join("\n"), subject: data.assessments[0] ? data.config.categories.length ? "Performance" : "Performance" : "Performance" };
    });
    const filename = `sukuunova-performance-${input.classId}-${input.subjectId}-${input.termId}.csv`;
    return new NextResponse(output.csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
