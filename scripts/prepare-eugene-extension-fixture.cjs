#!/usr/bin/env node
/* Compatibility pass for the Eugene Academy extension seed. */
const fs = require("fs");

const path = "scripts/seed-eugene-academy-trial.cjs";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  ['["Term 1 Resumption", "2026-09-07", "2026-09-07", "academic", true, true]', '["Term 1 Resumption", "2026-09-07", "2026-09-07", "closure", true, true]'],
  ['["Mid-term Break", "2026-10-26", "2026-10-30", "break", false, true]', '["Mid-term Break", "2026-10-26", "2026-10-30", "vacation", false, true]'],
  ['["PTA Open Day", "2026-11-14", "2026-11-14", "pta", false, false]', '["PTA Open Day", "2026-11-14", "2026-11-14", "closure", false, false]'],
  ['["Mock Examination Week", "2026-11-23", "2026-11-27", "exam", true, false]', '["Mock Examination Week", "2026-11-23", "2026-11-23", "exam_week", true, false]'],
  ['["Christmas Vacation", "2026-12-14", "2027-01-08", "break", false, false]', '["Christmas Vacation", "2026-12-14", "2027-01-08", "vacation", false, false]'],
];
for (const [from, to] of replacements) source = source.replace(from, to);
for (const [from] of replacements) {
  if (source.includes(from)) throw new Error("Eugene extension literal patch did not apply completely.");
}

const lessonNeedle = '      if (!teacher) continue;\n      const exists = await prisma.$queryRawUnsafe(\'SELECT "id" FROM "LessonPlan" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1\', schoolId, lessonPlans[i][0]);';
const lessonReplacement = '      if (!teacher) continue;\n      const lessonPlanTable = await prisma.$queryRawUnsafe(\'SELECT to_regclass(\\\'"LessonPlan"\\\') AS rel\');\n      if (!lessonPlanTable[0]?.rel) continue;\n      const exists = await prisma.$queryRawUnsafe(\'SELECT "id" FROM "LessonPlan" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1\', schoolId, lessonPlans[i][0]);';
if (!source.includes(lessonNeedle)) throw new Error("Could not locate LessonPlan extension query.");
source = source.replace(lessonNeedle, lessonReplacement);

const homeworkNeedle = '      if (!teacher) continue;\n      const exists = await prisma.$queryRawUnsafe(\'SELECT "id" FROM "Homework" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1\', schoolId, homeworks[i][0]);';
const homeworkReplacement = '      if (!teacher) continue;\n      const homeworkTable = await prisma.$queryRawUnsafe(\'SELECT to_regclass(\\\'"Homework"\\\') AS rel\');\n      if (!homeworkTable[0]?.rel) continue;\n      const exists = await prisma.$queryRawUnsafe(\'SELECT "id" FROM "Homework" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1\', schoolId, homeworks[i][0]);';
if (!source.includes(homeworkNeedle)) throw new Error("Could not locate Homework extension query.");
source = source.replace(homeworkNeedle, homeworkReplacement);

fs.writeFileSync(path, source, "utf8");
console.log("[eugene-academy-trial] extension fixture compatibility prepared");
