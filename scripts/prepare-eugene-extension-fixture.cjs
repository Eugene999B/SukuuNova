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
        'SELECT to_regclass($1)::text AS "name"',
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

const templateMarker = '    const template = await prisma.reportCardTemplate.upsert({';
const templateGuard = `    const reportCardTemplateRows = await prisma.$queryRawUnsafe(
      'SELECT to_regclass($1)::text AS "name"',
      'public."ReportCardTemplate"',
    );
    if (!reportCardTemplateRows[0]?.name) return;

`;
source = source.replace(templateMarker, templateGuard + templateMarker);

// The live database trigger requires submittedBy/submittedAt and forbids the
// submitter from being the approver. Patch the generated Eugene extension so
// the existing report-card row can be safely upserted on retries as well.
const submitterMarker = '    const sampleStudent = (await prisma.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" }, take: 1 }))[0];';
const submitterReplacement = `    const reportCardSubmitter = await prisma.user.findFirst({
      where: { schoolId, id: { not: owner.id }, email: { endsWith: ".eug123@test.sukuunova.local" } },
      orderBy: { createdAt: "asc" },
    }) || await prisma.user.findFirst({
      where: { schoolId, id: { not: owner.id } },
      orderBy: { createdAt: "asc" },
    });
    if (!reportCardSubmitter) throw new Error("Need a distinct Eugene Academy report-card submitter.");

    const sampleStudent = (await prisma.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" }, take: 1 }))[0];`;
source = source.replace(submitterMarker, submitterReplacement);

const reportCardUpsert = /await prisma\.reportCard\.upsert\(\{ where: \{ studentId_termId: \{ studentId: sampleStudent\.id, termId: pastTerm\.id \} \}, update: \{[\s\S]*?\}, create: \{[\s\S]*?\} \}\);/;
const reportCardReplacement = `await prisma.reportCard.upsert({ where: { studentId_termId: { studentId: sampleStudent.id, termId: pastTerm.id } }, update: { templateId: template.id, pdfData, status: "approved", submittedBy: reportCardSubmitter.id, submittedAt: new Date("2026-03-31T00:00:00.000Z"), approvedBy: owner.id, approvedAt: new Date("2026-04-01T00:00:00.000Z"), sentAt: new Date("2026-04-02T00:00:00.000Z"), remarks: "Official synthetic trial report card ready for download." }, create: { schoolId, studentId: sampleStudent.id, termId: pastTerm.id, templateId: template.id, pdfData, status: "approved", submittedBy: reportCardSubmitter.id, submittedAt: new Date("2026-03-31T00:00:00.000Z"), approvedBy: owner.id, approvedAt: new Date("2026-04-01T00:00:00.000Z"), sentAt: new Date("2026-04-02T00:00:00.000Z"), remarks: "Official synthetic trial report card ready for download." } });`;
if (!reportCardUpsert.test(source)) throw new Error("Could not locate Eugene report-card extension upsert.");
source = source.replace(reportCardUpsert, reportCardReplacement);

if (replacements.some(([from]) => source.includes(from))) {
  throw new Error("Eugene calendar compatibility patch did not apply completely.");
}
if (!source.includes('optionalTables.has("LessonPlan")')) throw new Error("LessonPlan optional guard was not applied.");
if (!source.includes('optionalTables.has("Homework")')) throw new Error("Homework optional guard was not applied.");
if (!source.includes('const reportCardSubmitter = await prisma.user.findFirst')) throw new Error("Report-card submitter patch was not applied.");
if (!source.includes('submittedBy: reportCardSubmitter.id')) throw new Error("Report-card submittedBy patch was not applied.");

fs.writeFileSync(path, source, "utf8");
console.log("[eugene-academy-trial] extension fixture compatibility prepared");
