import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { mapClassSection } from "@/lib/academic-structure-service";

type FrameworkRow = { id: string; templateKey: string | null };
type GradeRow = { id: string; name: string; sequence: number };
type ExistingSectionRow = { gradeLevelId: string; classId: string; sectionCode: string };

type ProvisionResult = {
  frameworkId: string | null;
  academicYearId: string | null;
  createdClasses: number;
  mappedClasses: number;
};

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function inferSection(gradeName: string, className: string, multipleCandidates: boolean) {
  const grade = gradeName.trim();
  const name = className.trim();
  if (normalise(name) === normalise(grade)) return { code: "MAIN", displayName: grade };

  if (normalise(name).startsWith(normalise(grade))) {
    const suffix = name.slice(grade.length).trim().replace(/^[-_\s]+/, "");
    if (suffix && suffix.length <= 40) {
      return {
        code: suffix.toUpperCase().replace(/\s+/g, "_"),
        displayName: /^[a-z0-9]$/i.test(suffix) ? `${grade}${suffix.toUpperCase()}` : `${grade} ${suffix}`,
      };
    }
  }

  return multipleCandidates
    ? { code: `GROUP_${Math.abs(className.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0))}`, displayName: className }
    : { code: "MAIN", displayName: grade };
}

/**
 * Makes an installed template operational: every standard grade becomes a real
 * Class and, when an unlocked academic year exists, a ClassSection. Existing
 * classes whose `level` already matches the standard are reused so legacy data
 * is preserved instead of duplicated.
 */
export async function provisionOfficialTemplateClasses(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; frameworkId?: string | null; academicYearId?: string | null },
): Promise<ProvisionResult> {
  const frameworkRows = await tx.$queryRawUnsafe<FrameworkRow[]>(
    input.frameworkId
      ? `SELECT "id","templateKey" FROM "AcademicFramework" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`
      : `SELECT "id","templateKey" FROM "AcademicFramework" WHERE "schoolId"=$1 AND "status"='active' AND "isDefault"=true ORDER BY "createdAt" DESC LIMIT 1`,
    ...(input.frameworkId ? [input.schoolId, input.frameworkId] : [input.schoolId]),
  );
  const framework = frameworkRows[0];
  if (!framework?.templateKey) return { frameworkId: framework?.id ?? null, academicYearId: null, createdClasses: 0, mappedClasses: 0 };

  const grades = await tx.$queryRawUnsafe<GradeRow[]>(
    `SELECT "id","name","sequence" FROM "GradeLevel" WHERE "schoolId"=$1 AND "frameworkId"=$2 AND "isActive"=true ORDER BY "sequence","name"`,
    input.schoolId,
    framework.id,
  );

  const targetYear = input.academicYearId
    ? await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId, isLocked: false }, select: { id: true } })
    : await tx.academicYear.findFirst({ where: { schoolId: input.schoolId, isLocked: false }, orderBy: { startDate: "desc" }, select: { id: true } });

  const schoolClasses = await tx.class.findMany({
    where: { schoolId: input.schoolId },
    select: { id: true, name: true, level: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  const existingSections = targetYear
    ? await tx.$queryRawUnsafe<ExistingSectionRow[]>(
        `SELECT cs."gradeLevelId",cs."classId",cs."sectionCode"
           FROM "ClassSection" cs
           JOIN "GradeLevel" g ON g."id"=cs."gradeLevelId" AND g."schoolId"=cs."schoolId"
          WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."isActive"=true AND g."frameworkId"=$3`,
        input.schoolId,
        targetYear.id,
        framework.id,
      )
    : [];

  let createdClasses = 0;
  let mappedClasses = 0;

  for (const grade of grades) {
    const gradeAlreadyMapped = existingSections.some((section) => section.gradeLevelId === grade.id);
    if (gradeAlreadyMapped) continue;

    const candidates = schoolClasses.filter((schoolClass) => {
      const levelMatches = normalise(schoolClass.level) === normalise(grade.name);
      const nameMatches = normalise(schoolClass.name) === normalise(grade.name);
      return levelMatches || nameMatches;
    });

    if (!candidates.length) {
      const schoolClass = await tx.class.create({
        data: { schoolId: input.schoolId, name: grade.name, level: grade.name },
        select: { id: true, name: true, level: true },
      });
      schoolClasses.push(schoolClass);
      candidates.push(schoolClass);
      createdClasses += 1;
      await appendSchoolAudit(tx, {
        schoolId: input.schoolId,
        actorId: input.actorId,
        action: "class.created_from_academic_template",
        entityType: "Class",
        entityId: schoolClass.id,
        after: { name: grade.name, level: grade.name, frameworkId: framework.id, gradeLevelId: grade.id },
      });
    }

    if (!targetYear) continue;

    for (const candidate of candidates) {
      const inferred = inferSection(grade.name, candidate.name, candidates.length > 1);
      await mapClassSection(tx, {
        schoolId: input.schoolId,
        actorId: input.actorId,
        academicYearId: targetYear.id,
        gradeLevelId: grade.id,
        classId: candidate.id,
        sectionCode: inferred.code,
        displayName: inferred.displayName,
        pathwayId: null,
        capacity: null,
      });
      mappedClasses += 1;
    }
  }

  return { frameworkId: framework.id, academicYearId: targetYear?.id ?? null, createdClasses, mappedClasses };
}
