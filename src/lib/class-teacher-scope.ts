import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type ClassTeacherClass = { id: string; name: string; level: string | null; scopeSource: "annual_class_section" | "legacy_class" };

export async function listClassTeacherClasses(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; academicYearId: string },
): Promise<ClassTeacherClass[]> {
  return tx.$queryRawUnsafe<ClassTeacherClass[]>(
    `SELECT DISTINCT c."id",c."name",c."level",
            CASE WHEN a."id" IS NOT NULL THEN 'annual_class_section' ELSE 'legacy_class' END AS "scopeSource"
       FROM "Class" c
       LEFT JOIN "ClassSection" cs
         ON cs."schoolId"=c."schoolId" AND cs."classId"=c."id" AND cs."academicYearId"=$3 AND cs."isActive"=true
       LEFT JOIN "ClassSectionStaffAssignment" a
         ON a."schoolId"=cs."schoolId" AND a."classSectionId"=cs."id" AND a."academicYearId"=$3
        AND a."userId"=$2 AND a."status"='active' AND a."responsibility"='class_teacher'
      WHERE c."schoolId"=$1
        AND (a."id" IS NOT NULL OR (cs."id" IS NULL AND c."classTeacherId"=$2))
      ORDER BY c."name"`,
    input.schoolId, input.actorId, input.academicYearId,
  );
}

export async function assertClassTeacherScope(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; academicYearId: string; classId: string },
) {
  const rows = await tx.$queryRawUnsafe<ClassTeacherClass[]>(
    `SELECT c."id",c."name",c."level",
            CASE WHEN a."id" IS NOT NULL THEN 'annual_class_section' ELSE 'legacy_class' END AS "scopeSource"
       FROM "Class" c
       LEFT JOIN "ClassSection" cs
         ON cs."schoolId"=c."schoolId" AND cs."classId"=c."id" AND cs."academicYearId"=$3 AND cs."isActive"=true
       LEFT JOIN "ClassSectionStaffAssignment" a
         ON a."schoolId"=cs."schoolId" AND a."classSectionId"=cs."id" AND a."academicYearId"=$3
        AND a."userId"=$2 AND a."status"='active' AND a."responsibility"='class_teacher'
      WHERE c."schoolId"=$1 AND c."id"=$4
        AND (a."id" IS NOT NULL OR (cs."id" IS NULL AND c."classTeacherId"=$2))
      LIMIT 1`,
    input.schoolId, input.actorId, input.academicYearId, input.classId,
  );
  if (!rows[0]) throw new AppError("You are not the assigned class teacher for this class in this academic year.", 403, "CLASS_TEACHER_SCOPE_REQUIRED");
  return rows[0];
}
