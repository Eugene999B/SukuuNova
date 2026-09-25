import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { reportClassAccess } from "@/lib/report-card-access";
import { generateReportCard } from "@/lib/report-card-service";
import { resolveTermRoster } from "@/lib/student-term-context";

const BATCH_SIZE = 3;
const schema = z.object({
  termId: z.string().min(1).max(120),
  classId: z.string().min(1).max(120),
  skipStudentIds: z.array(z.string().min(1).max(120)).max(200).default([]),
});

type FailedReport = { studentId: string; admissionNo: string; message: string };

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const skippedIds = new Set(input.skipStudentIds);

    const scope = await withTenant(session.schoolId, async (tx) => {
      const access = await reportClassAccess(tx, session.userId, "reports:generate");
      if (access.classIds && !access.classIds.includes(input.classId)) throw new AppError("This class is not assigned to your account.", 403, "FORBIDDEN");
      const [term, classRow, roster, candidates] = await Promise.all([
        tx.term.findFirst({ where: { id: input.termId, schoolId: session.schoolId }, select: { id: true } }),
        tx.class.findFirst({ where: { id: input.classId, schoolId: session.schoolId }, select: { id: true } }),
        resolveTermRoster(tx, { schoolId: session.schoolId, termId: input.termId }),
        tx.reportCard.findMany({
          where: { schoolId: session.schoolId, termId: input.termId },
          select: { studentId: true },
        }),
      ]);
      if (!term) throw new AppError("The selected reporting term no longer exists.", 404, "TERM_NOT_FOUND");
      if (!classRow) throw new AppError("The selected class no longer exists.", 404, "CLASS_NOT_FOUND");

      const students = roster
        .filter((student) => student.termClassId === input.classId)
        .map((student) => ({ id: student.id, admissionNo: student.admissionNo, name: student.name }));
      const existingIds = new Set(candidates.map(report => report.studentId));
      const pending = students.filter((student) => !existingIds.has(student.id) && !skippedIds.has(student.id));
      return { batch: pending.slice(0, BATCH_SIZE), pendingCount: pending.length };
    });

    if (!scope.batch.length) {
      return NextResponse.json({ generated: 0, attempted: 0, remaining: 0, failed: [] satisfies FailedReport[] });
    }

    let generated = 0;
    const failed: FailedReport[] = [];
    for (const student of scope.batch) {
      try {
        await withTenant(session.schoolId, (tx) =>
          generateReportCard(tx, {
            schoolId: session.schoolId,
            actorId: session.userId,
            studentId: student.id,
            termId: input.termId,
          }),
          { timeout: 20_000 },
        );
        generated += 1;
      } catch (error) {
        failed.push({
          studentId: student.id,
          admissionNo: student.admissionNo,
          message: error instanceof Error ? error.message.slice(0, 180) : "Report is not ready to generate.",
        });
      }
    }

    return NextResponse.json(
      {
        generated,
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
