#!/usr/bin/env node
/*
 * Read-only preflight for the guarded Eugene Academy hands-on trial.
 * It verifies the seeded school through the same tenant RLS boundary used by
 * SukuuNova and prints counts only — never credentials or learner details.
 *
 * Required environment:
 *   DATABASE_URL=<target database>
 *   TEST_SCHOOL_CODE=eug123
 */
const { PrismaClient } = require("@prisma/client");

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const schoolCode = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (schoolCode !== "eug123") throw new Error("Refusing trial verification: TEST_SCHOOL_CODE must be eug123.");

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

function asCount(row) {
  const value = Number(row?.count ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function count(tx, table, schoolColumn = "schoolId") {
  const allowed = new Set([
    "User", "Student", "Guardian", "Class", "Subject", "AcademicYear", "Term",
    "Assessment", "ReportCard", "IdentityCard", "SchoolSettings",
  ]);
  if (!allowed.has(table)) throw new Error(`Unsupported trial verification table: ${table}`);
  const rows = await tx.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count" FROM "${table}" WHERE "${schoolColumn}"=$1`,
    schoolId,
  );
  return asCount(rows[0]);
}

let schoolId = "";

async function main() {
  const directoryRows = await prisma.$queryRawUnsafe(
    `SELECT "schoolId" FROM "SchoolLoginDirectory" WHERE lower("uniqueCode")=$1 LIMIT 1`,
    schoolCode,
  );
  schoolId = String(directoryRows[0]?.schoolId || "");
  if (!schoolId) throw new Error("Eugene Academy login directory was not found. Run the guarded trial seed first.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", schoolId);
    const schoolRows = await tx.$queryRawUnsafe(
      `SELECT "id","name","uniqueCode","status" FROM "School" WHERE "id"=$1 LIMIT 1`,
      schoolId,
    );
    const school = schoolRows[0];
    if (!school || String(school.uniqueCode).toLowerCase() !== schoolCode) {
      throw new Error("Tenant-scoped school lookup failed for Eugene Academy.");
    }

    const counts = {
      staffAccounts: await count(tx, "User"),
      students: await count(tx, "Student"),
      guardians: await count(tx, "Guardian"),
      classes: await count(tx, "Class"),
      subjects: await count(tx, "Subject"),
      academicYears: await count(tx, "AcademicYear"),
      terms: await count(tx, "Term"),
      assessments: await count(tx, "Assessment"),
      reportCards: await count(tx, "ReportCard"),
      identityCards: await count(tx, "IdentityCard"),
      settingsRows: await count(tx, "SchoolSettings"),
    };

    const required = {
      staffAccounts: counts.staffAccounts > 0,
      students: counts.students > 0,
      guardians: counts.guardians > 0,
      classes: counts.classes > 0,
      subjects: counts.subjects > 0,
      academicCalendar: counts.academicYears > 0 && counts.terms > 0,
      assessments: counts.assessments > 0,
      reportCards: counts.reportCards > 0,
      settings: counts.settingsRows === 1,
    };
    const missing = Object.entries(required).filter(([, ok]) => !ok).map(([key]) => key);
    return {
      school: { name: school.name, code: school.uniqueCode, status: school.status },
      counts,
      readyForHandsOnTrial: missing.length === 0,
      missing,
      notes: {
        identityCards: counts.identityCards > 0
          ? "Existing cards are available for verification/reprint testing."
          : "No pre-issued cards: issue one from a learner/staff profile during the hands-on ID-card journey.",
      },
    };
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForHandsOnTrial) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
