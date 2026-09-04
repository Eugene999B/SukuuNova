#!/usr/bin/env node
/*
 * One-shot REAL DATABASE fixture for Eugene Academy.
 * Reuses SukuuNova's mature realistic school fixture, then extends it with
 * newer academic workflow records and an actual report-card PDF payload.
 *
 * Fail-closed gates:
 *   ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES
 *   TEST_SCHOOL_CODE=eug123
 *   TEST_SCHOOL_NAME=Eugene Academy
 *   EUGENE_ACADEMY_OWNER_EMAIL=<requested owner email>
 *   EUGENE_ACADEMY_OWNER_PASSWORD=<requested owner password>
 *
 * Credentials are passed only through environment variables and never printed.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();
const schoolName = String(process.env.TEST_SCHOOL_NAME || "").trim();
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const ownerEmail = String(process.env.EUGENE_ACADEMY_OWNER_EMAIL || "").trim().toLowerCase();
const ownerPassword = String(process.env.EUGENE_ACADEMY_OWNER_PASSWORD || "");
const ownerName = String(process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner").trim();

if (allow !== "YES") throw new Error("Refusing Eugene Academy live seed: explicit enable flag is required.");
if (code !== "eug123") throw new Error("Refusing Eugene Academy live seed: TEST_SCHOOL_CODE must be eug123.");
if (schoolName !== "Eugene Academy") throw new Error("Refusing Eugene Academy live seed: TEST_SCHOOL_NAME must be Eugene Academy.");
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!ownerEmail || !ownerPassword) throw new Error("Owner email and password are required through Railway variables.");

process.env.TEST_SCHOOL_CODE = code;
process.env.TEST_SCHOOL_NAME = schoolName;
process.env.TEST_SEED_PASSWORD = "EugeneTrialSeed!2026";
process.env.TEST_DATABASE_URL = databaseUrl + (databaseUrl.includes("?") ? "&" : "?") + "application_name=sukuunova-eugene-academy-trial";

const fixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const originalSource = fs.readFileSync(fixturePath, "utf8");
let patchedSource = originalSource
  .replace(
    'function email(slug) { return `${slug}.${TEST_CODE}@test.sukuunova.local`; }',
    'function email(slug) { if (slug === "owner") return process.env.EUGENE_ACADEMY_OWNER_EMAIL; return `${slug}.${TEST_CODE}@test.sukuunova.local`; }',
  )
  .replace('name: "Ama Mensah"', 'name: process.env.EUGENE_ACADEMY_OWNER_NAME')
  .replaceAll('https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg', '/branding/eugene-academy.svg')
  .replaceAll('SukuuNova Academy', 'Eugene Academy')
  .replace("VALUES ($1,$2,$3,'in','device'", "VALUES ($1,$2,$3,'in','qr'")
  .replace(
    'console.log(JSON.stringify(report, null, 2));',
    'console.log(JSON.stringify({ generatedAt: report.generatedAt, school: report.school, summary: report.summary }));',
  );

if (!patchedSource.includes('process.env.EUGENE_ACADEMY_OWNER_EMAIL')) throw new Error("Owner email patch was not applied; refusing to continue.");

const endMarker = 'main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => prisma.$disconnect());';
const extension = String.raw`
async function extendEugeneAcademy() {
  const prisma = new PrismaClient();
  try {
    const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
    if (!school) throw new Error("Eugene Academy was not created by the base fixture.");
    const schoolId = school.id;
    const passwordHash = await hash(process.env.EUGENE_ACADEMY_OWNER_PASSWORD, 12);

    const owner = await prisma.user.findFirst({ where: { schoolId, email: process.env.EUGENE_ACADEMY_OWNER_EMAIL } });
    if (!owner) throw new Error("Eugene Academy owner account was not created.");
    await prisma.user.update({ where: { id: owner.id }, data: { name: process.env.EUGENE_ACADEMY_OWNER_NAME || owner.name, passwordHash, status: "active", needsPasswordChange: false } });

    const term = await prisma.term.findFirst({ where: { schoolId, name: "Term 3" }, orderBy: { startDate: "desc" } });
    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, name: "2026/2027" } });
    const classes = await prisma.class.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 9 });
    const subjects = await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 8 });
    const academicCoordinator = await prisma.user.findFirst({ where: { schoolId, email: { endsWith: ".eug123@test.sukuunova.local" } }, orderBy: { createdAt: "asc" } });
    const reviewer = academicCoordinator || owner;
    if (!term || !academicYear || classes.length === 0 || subjects.length === 0) throw new Error("Eugene Academy base academic data is incomplete.");

    const eventRows = [
      ["Term 1 Resumption", "2026-09-07", "2026-09-07", "academic", true, true],
      ["Founders Day", "2026-09-21", "2026-09-21", "holiday", false, false],
      ["Mid-term Break", "2026-10-26", "2026-10-30", "break", false, true],
      ["PTA Open Day", "2026-11-14", "2026-11-14", "pta", false, false],
      ["Mock Examination Week", "2026-11-23", "2026-11-27", "exam", true, false],
      ["Christmas Vacation", "2026-12-14", "2027-01-08", "break", false, false]
    ];
    for (const row of eventRows) {
      const existing = await prisma.calendarEvent.findFirst({ where: { schoolId, name: row[0] } });
      if (!existing) await prisma.calendarEvent.create({ data: { schoolId, academicYearId: academicYear.id, type: row[3], name: row[0], startDate: new Date(row[1] + "T00:00:00.000Z"), endDate: new Date(row[2] + "T00:00:00.000Z"), affectsAttendance: row[4], affectsTransport: row[5] } });
    }

    const studentRole = await prisma.role.findFirst({ where: { schoolId, name: "Student" } });
    if (studentRole) {
      const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" }, take: 12 });
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const studentEmail = "student" + (i + 1) + ".eug123@test.sukuunova.local";
        const existing = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email: studentEmail } } });
        const account = existing || await prisma.user.create({ data: { schoolId, name: student.name + " Portal", email: studentEmail, phone: "+2332403" + String(100000 + i).slice(-6), passwordHash, status: "active", needsPasswordChange: false } });
        await prisma.userRole.upsert({ where: { userId_roleId: { userId: account.id, roleId: studentRole.id } }, update: { schoolId }, create: { schoolId, userId: account.id, roleId: studentRole.id } });
      }
    }

    const lessonPlans = [
      ["Fractions and Ratios", "Explain ratio problems using real-life examples.", "Ratio tables, worked examples, and pair exercises.", "2026-09-08", "approved"],
      ["Reading for Meaning", "Use inference and evidence to interpret a passage.", "Guided reading and evidence mapping.", "2026-09-09", "submitted"],
      ["Ecosystems", "Describe food chains and energy transfer.", "Local ecosystem diagram and discussion.", "2026-09-10", "draft"],
      ["Linear Expressions", "Simplify and evaluate linear expressions.", "Worked algebra examples and exit ticket.", "2026-09-11", "approved"],
      ["Civic Responsibility", "Relate civic duties to community life.", "Case study and reflection discussion.", "2026-09-14", "submitted"],
      ["Computer Lab Safety", "Identify safe computer and laboratory practices.", "Demonstration and safety checklist.", "2026-09-15", "draft"]
    ];
    for (let i = 0; i < lessonPlans.length; i++) {
      const subject = subjects[i % subjects.length];
      const cls = classes[i % classes.length];
      const teacher = await prisma.user.findFirst({ where: { schoolId, email: "class.teacher.eug123@test.sukuunova.local" } });
      if (!teacher) continue;
      const exists = await prisma.$queryRawUnsafe('SELECT "id" FROM "LessonPlan" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1', schoolId, lessonPlans[i][0]);
      if (!exists.length) await prisma.$executeRawUnsafe('INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","objective","content","plannedDate","status","reviewerId","reviewNote","reviewedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', "eug-lp-" + (i + 1), schoolId, teacher.id, cls.id, subject.id, term.id, lessonPlans[i][0], lessonPlans[i][1], lessonPlans[i][2], new Date(lessonPlans[i][3] + "T00:00:00.000Z"), lessonPlans[i][4], lessonPlans[i][4] === "draft" ? null : reviewer.id, lessonPlans[i][4] === "approved" ? "Approved for classroom delivery." : lessonPlans[i][4] === "submitted" ? "Submitted for academic review." : null, lessonPlans[i][4] === "draft" ? null : new Date());
    }

    const homeworks = [
      ["Ratio Practice Set", "Complete questions 1-15 and show working.", "2026-09-12", 20, "published", "approved"],
      ["Reading Evidence Journal", "Annotate the passage and record three evidence points.", "2026-09-13", 15, "published", "approved"],
      ["Ecosystem Diagram", "Create and label a food chain for a local habitat.", "2026-09-16", 20, "published", "not_reviewed"],
      ["Algebra Exit Challenge", "Simplify the ten expressions provided.", "2026-09-17", 25, "published", "approved"],
      ["Civic Reflection", "Write 250 words on one school-community responsibility.", "2026-09-18", 15, "draft", "not_reviewed"],
      ["Computer Lab Safety", "Complete the safety checklist before the next lab.", "2026-09-19", 10, "published", "approved"],
      ["French Vocabulary", "Learn and use 20 classroom nouns in sentences.", "2026-09-20", 20, "published", "approved"],
      ["Creative Arts Sketchbook", "Submit one perspective drawing and reflection.", "2026-09-21", 25, "published", "not_reviewed"]
    ];
    for (let i = 0; i < homeworks.length; i++) {
      const subject = subjects[i % subjects.length];
      const cls = classes[(i + 1) % classes.length];
      const teacher = await prisma.user.findFirst({ where: { schoolId, email: i % 2 === 0 ? "class.teacher.eug123@test.sukuunova.local" : "subject.teacher.eug123@test.sukuunova.local" } });
      if (!teacher) continue;
      const exists = await prisma.$queryRawUnsafe('SELECT "id" FROM "Homework" WHERE "schoolId"=$1 AND "title"=$2 LIMIT 1', schoolId, homeworks[i][0]);
      if (!exists.length) await prisma.$executeRawUnsafe('INSERT INTO "Homework" ("id","schoolId","teacherId","classId","subjectId","termId","title","instructions","dueDate","points","assignmentStatus","reviewStatus","reviewerId","reviewNote","reviewedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', "eug-hw-" + (i + 1), schoolId, teacher.id, cls.id, subject.id, term.id, homeworks[i][0], homeworks[i][1], new Date(homeworks[i][2] + "T00:00:00.000Z"), homeworks[i][3], homeworks[i][4], homeworks[i][5], homeworks[i][5] === "approved" ? reviewer.id : null, homeworks[i][5] === "approved" ? "Academic review completed." : null, homeworks[i][5] === "approved" ? new Date() : null);
    }

    const template = await prisma.reportCardTemplate.upsert({ where: { id: "eug-rct-20260904" }, update: { schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, sections: ["identity", "subjects", "attendance", "remarks", "approval"], brand: "Eugene Academy" } }, create: { id: "eug-rct-20260904", schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, sections: ["identity", "subjects", "attendance", "remarks", "approval"], brand: "Eugene Academy" } } });
    await prisma.schoolSettings.update({ where: { schoolId }, data: { reportCardTemplateId: template.id, reportCardConfig: { template: template.id, generatedSamples: true, downloadReady: true }, timetableConfig: { schoolDays: [1,2,3,4,5], periodsPerDay: 5, firstPeriod: "08:00", periodMinutes: 50 } } });

    const sampleStudent = (await prisma.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" }, take: 1 }))[0];
    const pastTerm = await prisma.term.findFirst({ where: { schoolId, name: "Term 2" }, orderBy: { startDate: "desc" } });
    if (sampleStudent && pastTerm) {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([595, 842]);
      let y = 790;
      page.drawText("EUGENE ACADEMY", { x: 48, y, size: 20, font: boldFont }); y -= 30;
      page.drawText("OFFICIAL STUDENT REPORT CARD", { x: 48, y, size: 12, font: boldFont }); y -= 25;
      page.drawText("Term 2 · 2025/2026", { x: 48, y, size: 10, font }); y -= 25;
      page.drawText("Student: " + sampleStudent.name, { x: 48, y, size: 11, font: boldFont }); y -= 18;
      page.drawText("Admission No: " + sampleStudent.admissionNo, { x: 48, y, size: 10, font }); y -= 28;
      const scores = await prisma.score.findMany({ where: { schoolId, studentId: sampleStudent.id }, orderBy: { enteredAt: "desc" }, take: 8 });
      for (let i = 0; i < subjects.length; i++) {
        const score = scores[i];
        page.drawText(subjects[i].name + ": " + (score ? Number(score.value).toFixed(1) : "—"), { x: 60, y, size: 9.5, font }); y -= 15;
      }
      y -= 8;
      page.drawText("Generated for Eugene Academy's synthetic end-to-end trial.", { x: 48, y, size: 9, font }); y -= 18;
      page.drawText("Approved by Principal", { x: 48, y, size: 9, font: boldFont });
      const pdfData = Buffer.from(await pdfDoc.save());
      await prisma.reportCard.upsert({ where: { studentId_termId: { studentId: sampleStudent.id, termId: pastTerm.id } }, update: { templateId: template.id, pdfData, status: "approved", approvedBy: owner.id, approvedAt: new Date("2026-04-01T00:00:00.000Z"), sentAt: new Date("2026-04-02T00:00:00.000Z"), remarks: "Official synthetic trial report card ready for download." }, create: { schoolId, studentId: sampleStudent.id, termId: pastTerm.id, templateId: template.id, pdfData, status: "approved", approvedBy: owner.id, approvedAt: new Date("2026-04-01T00:00:00.000Z"), sentAt: new Date("2026-04-02T00:00:00.000Z"), remarks: "Official synthetic trial report card ready for download." } });
    }

    console.log(JSON.stringify({ schoolId, school: school.name, code: school.uniqueCode, extension: { calendarEvents: 6, studentPortalAccounts: 12, lessonPlans: lessonPlans.length, homeworks: homeworks.length, reportCardTemplate: true, reportCardPdf: Boolean(sampleStudent && pastTerm) } }));
  } finally {
    await prisma.$disconnect();
  }
}
`;

if (!patchedSource.includes(endMarker)) throw new Error("Base fixture completion marker not found.");
patchedSource = patchedSource.replace(endMarker, extension + "\n" + "main().then(async () => { await prisma.$disconnect(); return extendEugeneAcademy(); }).catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => { try { await prisma.$disconnect(); } catch {} });");

const temp = path.join(__dirname, ".eugene-academy-trial-runtime-" + process.pid + ".cjs");
fs.writeFileSync(temp, patchedSource, "utf8");
const cleanup = () => { try { fs.unlinkSync(temp); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

const originalTransaction = PrismaClient.prototype.$transaction;
PrismaClient.prototype.$transaction = function patchedTransaction(arg, options, ...rest) {
  if (typeof arg === "function") return originalTransaction.call(this, arg, { maxWait: 60000, timeout: 300000, ...(options || {}) });
  return originalTransaction.call(this, arg, options, ...rest);
};

console.log("[eugene-academy-trial] starting guarded live seed");
require(temp);
