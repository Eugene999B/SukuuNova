#!/usr/bin/env node
/*
 * Supported Eugene Academy trial seed entrypoint.
 *
 * The historical trial wrapper extends the realistic fixture after the base
 * tenant transaction completes. This launcher hardens that extension so every
 * school-owned read/write happens inside one transaction with
 * app.current_school_id set, matching SukuuNova's forced-RLS production model.
 *
 * We patch in memory rather than weaken RLS or require a privileged database
 * role. Marker checks fail closed if the underlying wrapper changes.
 */
const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "seed-eugene-academy-trial.cjs");
const original = fs.readFileSync(sourcePath, "utf8");

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

if (!original.includes(vulnerableStart)) {
  throw new Error("Refusing Eugene Academy trial seed: expected extension-start marker changed.");
}
if (!original.includes(vulnerableEnd)) {
  throw new Error("Refusing Eugene Academy trial seed: expected extension-end marker changed.");
}

const hardened = original
  .replace(vulnerableStart, hardenedStart)
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

console.log("[eugene-academy-trial] enforcing tenant RLS for extension");
try {
  require(tempPath);
} catch (error) {
  cleanup();
  throw error;
}
