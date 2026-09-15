import { rawDb, withTenant } from "@/lib/db";
import { installAcademicStructureTemplate, mapClassSection } from "@/lib/academic-structure-service";

const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const PRODUCTION_ACK = "EUGENE_ACADEMY_ONLY";

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim();
const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();

if (allow !== PRODUCTION_ACK) {
  throw new Error(`Refusing Eugene Academy structure repair: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${PRODUCTION_ACK}.`);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (railwayEnvironment && railwayEnvironment !== "production") {
  throw new Error(`Refusing Eugene Academy structure repair in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
}

type GradeRow = { id: string; key: string; name: string };
type FrameworkRow = { id: string; isDefault: boolean };

type InferredLevel = { key: string; sectionCode: string } | null;

function inferGhanaLevel(className: string): InferredLevel {
  const name = className.trim();
  let match = name.match(/^Creche(?:\s+(.+))?$/i);
  if (match) return { key: "creche", sectionCode: match[1]?.trim().toUpperCase() || "MAIN" };

  match = name.match(/^Nursery\s*([12])(?:\s+(.+))?$/i);
  if (match) return { key: `nursery_${match[1]}`, sectionCode: match[2]?.trim().toUpperCase() || "MAIN" };

  match = name.match(/^KG\s*([12])(?:\s+(.+))?$/i);
  if (match) return { key: `kg_${match[1]}`, sectionCode: match[2]?.trim().toUpperCase() || "MAIN" };

  match = name.match(/^(?:Primary|Basic)\s*([1-6])(?:\s+(.+))?$/i);
  if (match) return { key: `basic_${match[1]}`, sectionCode: match[2]?.trim().toUpperCase() || "MAIN" };

  match = name.match(/^JHS\s*([1-3])(?:\s+(.+))?$/i);
  if (match) return { key: `jhs_${match[1]}`, sectionCode: match[2]?.trim().toUpperCase() || "MAIN" };

  match = name.match(/^SHS\s*([1-3])(?:\s+(.+))?$/i);
  if (match) return { key: `shs_${match[1]}`, sectionCode: match[2]?.trim().toUpperCase() || "MAIN" };

  return null;
}

async function main() {
  const directory = await rawDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode: SCHOOL_CODE },
    select: { schoolId: true },
  });
  if (!directory) throw new Error(`Eugene Academy directory ${SCHOOL_CODE} does not exist.`);

  const summary = await withTenant(directory.schoolId, async (tx) => {
    const schoolId = directory.schoolId;
    const school = await tx.school.findFirst({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true } });
    if (!school || school.name !== SCHOOL_NAME || school.uniqueCode !== SCHOOL_CODE) {
      throw new Error(`Refusing structure repair: expected ${SCHOOL_NAME} (${SCHOOL_CODE}).`);
    }

    const actor = await tx.user.findFirst({
      where: { schoolId, status: "active", userRoles: { some: { role: { name: "Owner" } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!actor) throw new Error("Eugene Academy has no active Owner account to audit the structure repair.");

    let frameworks = await tx.$queryRawUnsafe<FrameworkRow[]>(
      `SELECT "id","isDefault" FROM "AcademicFramework" WHERE "schoolId"=$1 AND "templateKey"='ghana_standard' AND "status"='active' ORDER BY "isDefault" DESC,"createdAt" ASC`,
      schoolId,
    );
    if (frameworks.length > 1) throw new Error("Eugene Academy has more than one active Ghana Standard framework; manual review is required.");

    let frameworkId = frameworks[0]?.id;
    if (!frameworkId) {
      const existingName = await tx.$queryRawUnsafe<Array<{ id: string; templateKey: string | null }>>(
        `SELECT "id","templateKey" FROM "AcademicFramework" WHERE "schoolId"=$1 AND lower("name")=lower('Ghana Standard') AND "status"='active' LIMIT 1`,
        schoolId,
      );
      if (existingName[0] && existingName[0].templateKey !== "ghana_standard") {
        throw new Error("An active non-template framework already uses the name Ghana Standard; refusing to guess its meaning.");
      }
      const installed = await installAcademicStructureTemplate(tx, {
        schoolId,
        actorId: actor.id,
        templateKey: "ghana_standard",
        makeDefault: true,
      });
      frameworkId = installed.id;
      frameworks = [{ id: frameworkId, isDefault: true }];
    }

    if (!frameworks[0]?.isDefault) {
      await tx.$executeRawUnsafe(`UPDATE "AcademicFramework" SET "isDefault"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "isDefault"=true`, schoolId);
      await tx.$executeRawUnsafe(`UPDATE "AcademicFramework" SET "isDefault"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, schoolId, frameworkId);
    }

    const grades = await tx.$queryRawUnsafe<GradeRow[]>(
      `SELECT "id","key","name" FROM "GradeLevel" WHERE "schoolId"=$1 AND "frameworkId"=$2 AND "isActive"=true ORDER BY "sequence" ASC`,
      schoolId,
      frameworkId,
    );
    if (grades.length !== 17) throw new Error(`Expected all 17 Ghana Standard levels, found ${grades.length}.`);
    const gradeByKey = new Map(grades.map((grade) => [grade.key, grade]));

    const academicYear = await tx.academicYear.findFirst({
      where: { schoolId, name: "2026/2027" },
      select: { id: true, name: true, isLocked: true },
    }) ?? await tx.academicYear.findFirst({
      where: { schoolId, isLocked: false },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isLocked: true },
    });
    if (!academicYear) throw new Error("Eugene Academy has no academic year available for its class structure.");
    if (academicYear.isLocked) throw new Error(`Academic year ${academicYear.name} is locked; refusing to change its class structure.`);

    const classes = await tx.class.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const mapped: Array<{ className: string; grade: string; category: string }> = [];
    const unrecognised: string[] = [];

    for (const schoolClass of classes) {
      const inferred = inferGhanaLevel(schoolClass.name);
      if (!inferred) {
        unrecognised.push(schoolClass.name);
        continue;
      }
      const grade = gradeByKey.get(inferred.key);
      if (!grade) throw new Error(`Ghana Standard level '${inferred.key}' is missing.`);
      await mapClassSection(tx, {
        schoolId,
        actorId: actor.id,
        academicYearId: academicYear.id,
        gradeLevelId: grade.id,
        classId: schoolClass.id,
        sectionCode: inferred.sectionCode,
        displayName: schoolClass.name,
        capacity: null,
      });
      mapped.push({ className: schoolClass.name, grade: grade.name, category: inferred.sectionCode });
    }

    if (!mapped.length) throw new Error("No Eugene Academy classes matched the Ghana Standard structure.");

    const sectionRows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS "count" FROM "ClassSection" cs JOIN "GradeLevel" gl ON gl."schoolId"=cs."schoolId" AND gl."id"=cs."gradeLevelId" WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND gl."frameworkId"=$3 AND cs."isActive"=true`,
      schoolId,
      academicYear.id,
      frameworkId,
    );
    const learnerRows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS "count" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "frameworkId"=$3 AND "status" IN ('active','retained')`,
      schoolId,
      academicYear.id,
      frameworkId,
    );

    return {
      school: `${school.name} (${school.uniqueCode})`,
      academicYear: academicYear.name,
      frameworkId,
      standardLevels: grades.length,
      mappedClasses: mapped,
      unrecognisedClasses: unrecognised,
      activeSections: Number(sectionRows[0]?.count ?? 0),
      learnerYearGrades: Number(learnerRows[0]?.count ?? 0),
    };
  });

  console.log("[eugene-structure] verified", JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("[eugene-structure] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await rawDb.$disconnect();
  });
