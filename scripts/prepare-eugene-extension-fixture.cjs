#!/usr/bin/env node
/* Compatibility pass for the Eugene Academy extension seed.
 * Keeps the synthetic calendar records aligned with the live CalendarEvent
 * check constraint and protects optional extension tables that may be absent
 * on an older production database.
 */
const fs = require("fs");

const path = "scripts/seed-eugene-academy-trial.cjs";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  ['["Term 1 Resumption", "2026-09-07", "2026-09-07", "academic", true, true]', '["Term 1 Resumption", "2026-09-07", "2026-09-07", "closure", true, true]'],
  ['["Mid-term Break", "2026-10-26", "2026-10-30", "break", false, true]', '["Mid-term Break", "2026-10-26", "2026-10-30", "vacation", false, true]'],
  ['["PTA Open Day", "2026-11-14", "2026-11-14", "pta", false, false]', '["PTA Open Day", "2026-11-14", "2026-11-14", "closure", false, false]'],
  ['["Mock Examination Week", "2026-11-23", "2026-11-27", "exam", true, false]', '["Mock Examination Week", "2026-11-23", "2026-11-27", "exam_week", true, false]'],
  ['["Christmas Vacation", "2026-12-14", "2027-01-08", "break", false, false]', '["Christmas Vacation", "2026-12-14", "2027-01-08", "vacation", false, false]'],
];

for (const [from, to] of replacements) source = source.replace(from, to);

const marker = '    const lessonPlans = [';
const guardStart = `    const optionalTables = new Set();
    const optionalTableNames = ["LessonPlan", "Homework"];
    for (const tableName of optionalTableNames) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT to_regclass($1) AS "name"',
        'public."' + tableName + '"',
      );
      if (rows[0] && rows[0].name) optionalTables.add(tableName);
    }

`;
source = source.replace(marker, guardStart + marker);
source = source.replace(
  '    for (let i = 0; i < lessonPlans.length; i++) {',
  '    if (optionalTables.has("LessonPlan")) for (let i = 0; i < lessonPlans.length; i++) {'
);
source = source.replace(
  '    for (let i = 0; i < homeworks.length; i++) {',
  '    if (optionalTables.has("Homework")) for (let i = 0; i < homeworks.length; i++) {'
);

// Report-card template support is also optional on an older live schema.
const templateMarker = '    const template = await prisma.reportCardTemplate.upsert({';
const templateGuard = `    const reportCardTemplateRows = await prisma.$queryRawUnsafe(
      'SELECT to_regclass($1) AS "name"',
      'public."ReportCardTemplate"',
    );
    if (!reportCardTemplateRows[0]?.name) return;

`;
source = source.replace(templateMarker, templateGuard + templateMarker);

if (replacements.some(([from]) => source.includes(from))) {
  throw new Error("Eugene calendar compatibility patch did not apply completely.");
}
if (!source.includes('optionalTables.has("LessonPlan")')) throw new Error("LessonPlan optional guard was not applied.");
if (!source.includes('optionalTables.has("Homework")')) throw new Error("Homework optional guard was not applied.");

fs.writeFileSync(path, source, "utf8");
console.log("[eugene-academy-trial] extension fixture compatibility prepared");
