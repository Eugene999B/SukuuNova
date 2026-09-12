import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { requirePermission } from "@/lib/rbac";
import { resolveTermRoster } from "@/lib/student-term-context";
import { buildTermCompletionReadiness } from "@/lib/term-completion-readiness";

const query = z.object({ termId: z.string().min(1) });

type CurriculumRow = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const { termId } = query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "calendar:manage");
      const [term, classes, students, assignments, assessments, reports, config, offerings] = await Promise.all([
        tx.term.findFirst({
          where: { id: termId, schoolId: session.schoolId },
          select: { id: true, name: true, startDate: true, endDate: true, isLocked: true },
        }),
        tx.class.findMany({
          where: { schoolId: session.schoolId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        resolveTermRoster(tx, { schoolId: session.schoolId, termId }),
        tx.classSubjectTeacher.findMany({
          where: { schoolId: session.schoolId },
          select: { classId: true, subjectId: true, teacherId: true },
        }),
        tx.assessment.findMany({
          where: { schoolId: session.schoolId, termId },
          select: { id: true, classId: true, subjectId: true },
        }),
        tx.reportCard.findMany({
          where: { schoolId: session.schoolId, termId },
          select: { studentId: true, status: true },
        }),
        getAcademicEngineConfig(tx, session.schoolId),
        tx.$queryRaw<CurriculumRow[]>`
          SELECT
            o."classId" AS "classId",
            c."name" AS "className",
            o."subjectId" AS "subjectId",
            s."name" AS "subjectName"
          FROM "ClassSubjectOffering" o
          INNER JOIN "Class" c ON c."id" = o."classId" AND c."schoolId" = o."schoolId"
          INNER JOIN "Subject" s ON s."id" = o."subjectId" AND s."schoolId" = o."schoolId"
          WHERE o."schoolId" = ${session.schoolId}
          ORDER BY c."name" ASC, s."name" ASC
        `,
      ]);
      if (!term) return null;

      const assessmentIds = assessments.map((assessment) => assessment.id);
      const scores = assessmentIds.length
        ? await tx.score.findMany({
            where: { schoolId: session.schoolId, assessmentId: { in: assessmentIds } },
            select: { assessmentId: true, studentId: true, status: true },
          })
        : [];

      const readiness = buildTermCompletionReadiness({
        classes,
        students: students.map((student) => ({ id: student.id, termClassId: student.termClassId ?? null })),
        offerings,
        assignments,
        assessments,
        scores,
        reports,
        assessmentConfig: config.assessment,
      });

      return { term, ...readiness };
    });
    if (!result) return NextResponse.json({ error: "Term not found." }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
