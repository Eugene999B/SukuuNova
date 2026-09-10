#!/usr/bin/env node
/*
 * Supported Eugene Academy trial seed entrypoint.
 *
 * The historical trial wrapper extends the realistic fixture after the base
 * tenant transaction completes. This launcher hardens that extension so every
 * school-owned read/write happens inside one transaction with
 * app.current_school_id set, matching SukuuNova's forced-RLS production model.
 *
 * It also repairs known fixture-only academic schema drift in memory. We do
 * not weaken production schema constraints to accommodate old demo data.
 * Marker checks fail closed if the underlying wrappers change.
 */
const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "seed-eugene-academy-trial.cjs");
const original = fs.readFileSync(sourcePath, "utf8");

const baseAcademicOld = String.raw`    const termRows = [
      ["Term 1", "2025-09-01", "2025-12-19"],
      ["Term 2", "2026-01-05", "2026-04-10"],
      ["Term 3", "2026-04-20", "2026-07-31"]
    ];
    const termMap = new Map();
    for (const [name, startDate, endDate] of termRows) {
      const term = await tx.term.upsert({ where: { schoolId_name: { schoolId, name } }, update: { startDate: d(startDate), endDate: d(endDate), status: name === "Term 3" ? "ACTIVE" : "COMPLETED" }, create: { schoolId, name, startDate: d(startDate), endDate: d(endDate), status: name === "Term 3" ? "ACTIVE" : "COMPLETED" } });
      termMap.set(name, term);
    }
    const academicYear = await tx.academicYear.upsert({ where: { schoolId_name: { schoolId, name: "2025/2026" } }, update: {}, create: { schoolId, name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-07-31"), status: "ACTIVE" } });`;

const baseAcademicNew = String.raw`    const academicYear = await tx.academicYear.upsert({
      where: { schoolId_name: { schoolId, name: "2025/2026" } },
      update: { startDate: d("2025-09-01"), endDate: d("2026-07-31") },
      create: { schoolId, name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-07-31") }
    });
    const termRows = [
      ["Term 1", "2025-09-01", "2025-12-19"],
      ["Term 2", "2026-01-05", "2026-04-10"],
      ["Term 3", "2026-04-20", "2026-07-31"]
    ];
    const termMap = new Map();
    for (const [name, startDate, endDate] of termRows) {
      const term = await tx.term.upsert({
        where: { schoolId_academicYearId_name: { schoolId, academicYearId: academicYear.id, name } },
        update: { startDate: d(startDate), endDate: d(endDate) },
        create: { schoolId, academicYearId: academicYear.id, name, startDate: d(startDate), endDate: d(endDate) }
      });
      termMap.set(name, term);
    }`;

const patchedSourceMarker = "let patchedSource = originalSource\n";
const patchedSourceReplacement = `let patchedSource = originalSource\n  .replace(${JSON.stringify(baseAcademicOld)}, ${JSON.stringify(baseAcademicNew)})\n`;

const vulnerableStart = String.raw`async function extendEugeneAcademy() {
  const prisma = new PrismaClient();
  const { PDFDocument: TrialPDFDocument, StandardFonts: TrialStandardFonts } = require("pdf-lib");
  try {
    const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
    if (!school) throw new Error("Eugene Academy was not created by the base fixture.");
    const schoolId = school.id;
    const passwordHash = await hash(process.env.EUGENE_ACADEMY_OWNER_PASSWORD, 12);`;

const hardenedStart = String.raw`async function extendEugeneAcademy() {
  const rootDb = new PrismaClient();
  const { PDFDocument: TrialPDFDocument, StandardFonts: TrialStandardFonts } = require("pdf-lib");
  try {
    const directoryRows = await rootDb.$queryRawUnsafe(
      'SELECT "schoolId" FROM "SchoolLoginDirectory" WHERE lower("uniqueCode")=$1 LIMIT 1',
      "eug123",
    );
    const schoolId = String(directoryRows[0]?.schoolId || "");
    if (!schoolId) throw new Error("Eugene Academy was not created by the base fixture.");
    await rootDb.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", schoolId);
      const prisma = tx;
      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      if (!school) throw new Error("Eugene Academy tenant lookup failed after entering RLS context.");
      const passwordHash = await hash(process.env.EUGENE_ACADEMY_OWNER_PASSWORD, 12);`;

const extensionAcademicOld = String.raw`    const term = await prisma.term.findFirst({ where: { schoolId, name: "Term 3" }, orderBy: { startDate: "desc" } });
    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, name: "2026/2027" } });
    const classes = await prisma.class.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 9 });`;

const extensionAcademicNew = String.raw`      const academicYear = await prisma.academicYear.upsert({
        where: { schoolId_name: { schoolId, name: "2026/2027" } },
        update: { startDate: new Date("2026-09-07T00:00:00.000Z"), endDate: new Date("2027-07-30T00:00:00.000Z") },
        create: { schoolId, name: "2026/2027", startDate: new Date("2026-09-07T00:00:00.000Z"), endDate: new Date("2027-07-30T00:00:00.000Z") },
      });
      const term = await prisma.term.upsert({
        where: { schoolId_academicYearId_name: { schoolId, academicYearId: academicYear.id, name: "Term 1" } },
        update: { startDate: new Date("2026-09-07T00:00:00.000Z"), endDate: new Date("2026-12-18T00:00:00.000Z") },
        create: { schoolId, academicYearId: academicYear.id, name: "Term 1", startDate: new Date("2026-09-07T00:00:00.000Z"), endDate: new Date("2026-12-18T00:00:00.000Z") },
      });
      const classes = await prisma.class.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 9 });`;

const vulnerableEnd = String.raw`    console.log(JSON.stringify({ schoolId, school: school.name, code: school.uniqueCode, extension: { calendarEvents: 6, studentPortalAccounts: 12, lessonPlans: lessonPlans.length, homeworks: homeworks.length, reportCardTemplate: true, reportCardPdf: Boolean(sampleStudent && pastTerm) } }));
  } finally {
    await prisma.$disconnect();
  }
}`;

const hardenedEnd = String.raw`      console.log(JSON.stringify({ schoolId, school: school.name, code: school.uniqueCode, extension: { calendarEvents: 6, studentPortalAccounts: 12, lessonPlans: lessonPlans.length, homeworks: homeworks.length, reportCardTemplate: true, reportCardPdf: Boolean(sampleStudent && pastTerm) } }));
    });
  } finally {
    await rootDb.$disconnect();
  }
}`;

for (const [label, marker] of [
  ["fixture patch hook", patchedSourceMarker],
  ["extension start", vulnerableStart],
  ["extension academic block", extensionAcademicOld],
  ["extension end", vulnerableEnd],
]) {
  if (!original.includes(marker)) throw new Error(`Refusing Eugene Academy trial seed: expected ${label} marker changed.`);
}

const hardened = original
  .replace(patchedSourceMarker, patchedSourceReplacement)
  .replace(vulnerableStart, hardenedStart)
  .replace(extensionAcademicOld, extensionAcademicNew)
  .replace(vulnerableEnd, hardenedEnd);

if (hardened.includes('const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } })')) {
  throw new Error("Refusing Eugene Academy trial seed: unscoped tenant school lookup remains.");
}

const tempPath = path.join(__dirname, `.eugene-academy-rls-${process.pid}.cjs`);
fs.writeFileSync(tempPath, hardened, "utf8");
const cleanup = () => { try { fs.unlinkSync(tempPath); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

console.log("[eugene-academy-trial] enforcing tenant RLS and current academic schema");
try {
  require(tempPath);
} catch (error) {
  cleanup();
  throw error;
}
