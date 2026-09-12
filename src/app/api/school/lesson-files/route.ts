import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";

type ReviewPlanRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  weekNumber: number;
  status: string;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  reviewerName: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      if (!(await hasPermission(tx, session.userId, "lesson_plans:review"))) throw new ForbiddenError("You do not have lesson-plan review permission.");

      const [settings, terms] = await Promise.all([
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
        tx.term.findMany({
          where: { schoolId: session.schoolId },
          orderBy: { startDate: "desc" },
          select: { id: true, name: true, startDate: true, endDate: true, isLocked: true, academicYear: { select: { name: true } } },
        }),
      ]);
      const timezone = settings?.timezone || "Africa/Accra";
      const active = selectAcademicTerm(terms, undefined, new Date(), timezone);
      if (!active) return NextResponse.json({ activeTerm: null, rows: [] });
      const weekRows = await tx.$queryRawUnsafe<Array<{ teachingWeeks: number }>>(
        `SELECT "teachingWeeks" FROM "Term" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
        session.schoolId,
        active.id,
      );
      const teachingWeeks = weekRows[0]?.teachingWeeks ?? 13;
      const rows = await tx.$queryRawUnsafe<ReviewPlanRow[]>(`
        SELECT lp."id",lp."teacherId",teacher."name" AS "teacherName",lp."classId",c."name" AS "className",
          lp."subjectId",s."name" AS "subjectName",lp."weekNumber",lp."status",lp."submittedAt",lp."reviewedAt",lp."reviewNote",
          reviewer."name" AS "reviewerName",a."fileName",a."mimeType",a."sizeBytes"
        FROM "LessonPlan" lp
        JOIN "User" teacher ON teacher."id"=lp."teacherId" AND teacher."schoolId"=lp."schoolId"
        JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
        JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
        LEFT JOIN "User" reviewer ON reviewer."id"=lp."reviewerId" AND reviewer."schoolId"=lp."schoolId"
        LEFT JOIN "LessonPlanAttachment" a ON a."lessonPlanId"=lp."id" AND a."schoolId"=lp."schoolId"
        WHERE lp."schoolId"=$1 AND lp."termId"=$2 AND lp."status" <> 'draft'
        ORDER BY c."name" ASC,s."name" ASC,lp."weekNumber" DESC,lp."submittedAt" DESC NULLS LAST`,
        session.schoolId,
        active.id,
      );

      return NextResponse.json({
        activeTerm: {
          id: active.id,
          name: active.name,
          academicYear: active.academicYear.name,
          teachingWeeks,
          lifecycle: termLifecycle(active, new Date(), timezone),
        },
        rows,
      });
    });
  } catch (error) {
    return routeError(error);
  }
}
