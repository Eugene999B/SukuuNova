import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { generateReportCard } from "@/lib/report-card-service";
import { reportBelongsToClass } from "@/lib/report-card-print-data";

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
      await requirePermission(tx, session.userId, "reports:generate");
      const [term, classRow, students, candidates] = await Promise.all([
        tx.term.findFirst({ where: { id: input.termId, schoolId: session.schoolId }, select: { id: true } }),
        tx.class.findFirst({ where: { id: input.classId, schoolId: session.schoolId }, select: { id: true } }),
        tx.student.findMany({
          where: { schoolId: session.schoolId, classId: input.classId, status: "active" },
          select: { id: true, admissionNo: true },
          orderBy: { name: "asc" },
        }),
        tx.reportCard.findMany({
          where: { schoolId: session.schoolId, termId: input.termId },
          select: { studentId: true, calculationSnapshot: true, student: { select: { classId: true } } },
        }),
      ]);
      if (!term) throw new AppError("The selected reporting term no longer exists.", 404, "TERM_NOT_FOUND");
      if (!classRow) throw new AppError("The selected class no longer exists.", 404, "CLASS_NOT_FOUND");

      const existingIds = new Set(
        candidates
          .filter((row) => reportBelongsToClass(row.calculationSnapshot, row.student.classId, input.classId))
          .map((row) => row.studentId),
      );
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
        // Intentionally use a fresh tenant transaction for each learner. The old
        // class generator rendered every PDF inside one interactive transaction,
        // so a large class could outlive Prisma's transaction window and fail
        // unpredictably. Short isolated transactions keep memory/locks bounded
        // and preserve successful learners even if one record is not ready.
        await withTenant(session.schoolId, (tx) =>
          generateReportCard(tx, {
            schoolId: session.schoolId,
            actorId: session.userId,
            studentId: student.id,
            termId: input.termId,
          }),
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
