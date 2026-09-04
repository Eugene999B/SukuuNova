#!/usr/bin/env node
/*
 * One-shot REAL DATABASE fixture for Eugene Academy.
 *
 * Safety gates are intentionally narrow. The runner can only execute when
 * explicitly enabled for the eug123 trial school, and credentials arrive via
 * Railway environment variables rather than source control.
 *
 * The mature realistic fixture is reused and patched in-memory. This keeps
 * the fixture aligned with SukuuNova's established data model while adding
 * newer lesson-planning, homework, report-card, device and readiness records.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

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
if (!ownerEmail || !ownerPassword) throw new Error("EUGENE_ACADEMY_OWNER_EMAIL and EUGENE_ACADEMY_OWNER_PASSWORD are required.");

process.env.TEST_SCHOOL_CODE = code;
process.env.TEST_SCHOOL_NAME = schoolName;
process.env.TEST_SEED_PASSWORD = ownerPassword;
process.env.TEST_DATABASE_URL = databaseUrl + (databaseUrl.includes("?") ? "&" : "?") + "application_name=sukuunova-eugene-academy-trial";

const fixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const originalSource = fs.readFileSync(fixturePath, "utf8");

let patchedSource = originalSource
  .replace('if (PASSWORD.length < 12) throw new Error("TEST_SEED_PASSWORD must be at least 12 characters.");', 'if (PASSWORD.length < 12 && TEST_CODE !== "eug123") throw new Error("TEST_SEED_PASSWORD must be at least 12 characters.");')
  .replace('function email(slug) { return `${slug}.${TEST_CODE}@test.sukuunova.local`; }', 'function email(slug) { if (slug === "owner") return process.env.EUGENE_ACADEMY_OWNER_EMAIL; return `${slug}.${TEST_CODE}@test.sukuunova.local`; }')
  .replaceAll('name: "Ama Mensah"', 'name: process.env.EUGENE_ACADEMY_OWNER_NAME')
  .replaceAll('https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg', '/branding/eugene-academy.svg')
  .replaceAll('SukuuNova Academy', 'Eugene Academy');

const anchor = '    // Fees, invoices, partial payment and reversal scenario.';
const injection = String.raw`
    // Eugene Academy extension: populate newer academic and operational workflows.
    const { PDFDocument, StandardFonts } = require("pdf-lib");

    const currentYear = yearsMap["2026/2027"];
    const calendarEvents = [
      ["Term 1 Resumption", "2026-09-07", "2026-09-07", "academic", true, true],
      ["Founders Day", "2026-09-21", "2026-09-21", "holiday", false, false],
      ["Mid-term Break", "2026-10-26", "2026-10-30", "break", false, true],
      ["PTA Open Day", "2026-11-14", "2026-11-14", "pta", false, false],
      ["Mock Examination Week", "2026-11-23", "2026-11-27", "exam", true, false],
      ["Christmas Vacation", "2026-12-14", "2027-01-08", "break", false, false]
    ];
    for (const [name, start, end, type, affectsAttendance, affectsTransport] of calendarEvents) {
      await tx.calendarEvent.create({ data: { id: uid(), schoolId, academicYearId: currentYear.id, type, name, startDate: d(start), endDate: d(end), affectsAttendance, affectsTransport } }).catch(() => {});
    }

    for (let i = 0; i < 12; i++) {
      const student = students[i];
      const studentEmail = email("student" + (i + 1));
      const portalName = student.name + " Portal";
      const studentUser = await tx.user.upsert({
        where: { schoolId_email: { schoolId, email: studentEmail } },
        update: { name: portalName, passwordHash: passwordsHash, status: "active", needsPasswordChange: false },
        create: { schoolId, name: portalName, email: studentEmail, phone: phone(300 + i), passwordHash: passwordsHash, status: "active", needsPasswordChange: false }
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: studentUser.id, roleId: roleIds.get("Student") } },
        update: { schoolId },
        create: { schoolId, userId: studentUser.id, roleId: roleIds.get("Student") }
      });
      credentials.push({ type: "student", role: "Student", name: studentUser.name, email: studentUser.email, password: PASSWORD, schoolCode: TEST_CODE, admissionNo: student.admissionNo });
    }

    const lessonPlans = [
      ["Fractions and Ratios", "Explain and solve ratio problems using real-life examples.", "Ratio tables, worked examples, pair exercises.", "2026-09-08", "approved", users.academic.id],
      ["Reading for Meaning", "Use inference and evidence to interpret a short passage.", "Guided reading and evidence mapping.", "2026-09-09", "submitted", users.academic.id],
      ["Ecosystems", "Describe food chains and energy transfer.", "Diagram of a local ecosystem.", "2026-09-10", "draft", null],
      ["Linear Expressions", "Simplify and evaluate linear expressions.", "Worked algebra examples and exit ticket.", "2026-09-11", "approved", users.academic.id],
      ["Civic Responsibility", "Relate civic duties to school-community life.", "Case study and reflection discussion.", "2026-09-14", "submitted", users.academic.id],
      ["Intro to Computing", "Identify core computer hardware and safe usage practices.", "Lab demonstration and safety checklist.", "2026-09-15", "draft", null]
    ];
    for (let i = 0; i < lessonPlans.length; i++) {
      const subject = subjects[i % subjects.length];
      const cls = classes[i % classes.length];
      const teacher = i % 2 === 0 ? users["class.teacher"] : users["subject.teacher"];
      const item = lessonPlans[i];
      const plannedStatus = item[4];
      const reviewerId = item[5];
      await exec(tx, 'INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","objective","content","plannedDate","status","reviewerId","reviewNote","reviewedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT ("id") DO NOTHING', uid(), schoolId, teacher.id, cls.id, subject.id, termMap["Term 3"].id, item[0], item[1], item[2], d(item[3]), plannedStatus, reviewerId, plannedStatus === "approved" ? "Reviewed and approved for classroom delivery." : plannedStatus === "submitted" ? "Ready for academic review." : null, reviewerId ? new Date() : null);
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
      const teacher = i % 2 === 0 ? users["class.teacher"] : users["subject.teacher"];
      const item = homeworks[i];
      const reviewStatus = item[5];
      await exec(tx, 'INSERT INTO "Homework" ("id","schoolId","teacherId","classId","subjectId","termId","title","instructions","dueDate","points","assignmentStatus","reviewStatus","reviewerId","reviewNote","reviewedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT ("id") DO NOTHING', uid(), schoolId, teacher.id, cls.id, subject.id, termMap["Term 3"].id, item[0], item[1], d(item[2]), item[3], item[4], reviewStatus, reviewStatus === "approved" ? users.academic.id : null, reviewStatus === "approved" ? "Academic review completed." : null, reviewStatus === "approved" ? new Date() : null);
    }

    const templateId = "eug-rct-20260904";
    await tx.reportCardTemplate.upsert({ where: { id: templateId }, update: { schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, orientation: "portrait", sections: ["identity", "subjects", "attendance", "remarks", "approval"], brand: "Eugene Academy" } }, create: { id: templateId, schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, orientation: "portrait", sections: ["identity", "subjects", "attendance", "remarks", "approval"], brand: "Eugene Academy" } } });
    await tx.schoolSettings.update({ where: { schoolId }, data: { reportCardTemplateId: templateId, reportCardConfig: { template: templateId, generatedSamples: true, downloadReady: true }, timetableConfig: { schoolDays: [1,2,3,4,5], periodsPerDay: 5, firstPeriod: "08:00", periodMinutes: 50 } } });

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pdfPage = pdfDoc.addPage([595, 842]);
    let y = 792;
    pdfPage.drawText("EUGENE ACADEMY", { x: 48, y, size: 20, font: boldFont }); y -= 28;
    pdfPage.drawText("OFFICIAL STUDENT REPORT CARD · TERM 2 · 2025/2026", { x: 48, y, size: 10, font }); y -= 24;
    pdfPage.drawText("Student: " + highLoad.name, { x: 48, y, size: 11, font: boldFont }); y -= 18;
    pdfPage.drawText("Admission No: " + highLoad.admissionNo, { x: 48, y, size: 10, font }); y -= 28;
    for (const subject of subjects) {
      const scoreRow = await tx.score.findFirst({ where: { schoolId, studentId: highLoad.id, subjectId: subject.id }, orderBy: { enteredAt: "desc" } });
      pdfPage.drawText(subject.name + ": " + (scoreRow ? Number(scoreRow.value).toFixed(1) : "—"), { x: 60, y, size: 9.5, font });
      y -= 15;
    }
    y -= 6;
    pdfPage.drawText("Attendance, teacher remarks and approval are retained in SukuuNova.", { x: 48, y, size: 9, font }); y -= 18;
    pdfPage.drawText("Approved by Principal · Eugene Academy", { x: 48, y, size: 9, font: boldFont });
    const pdfData = Buffer.from(await pdfDoc.save());
    await tx.reportCard.upsert({
      where: { studentId_termId: { studentId: highLoad.id, termId: termMap["Term 2"].id } },
      update: { templateId, pdfData, status: "approved", submittedBy: users["class.teacher"].id, submittedAt: d("2026-04-01"), approvedBy: users.principal.id, approvedAt: d("2026-04-01"), sentAt: d("2026-04-02"), remarks: "Official synthetic trial report card ready for download." },
      create: { schoolId, studentId: highLoad.id, termId: termMap["Term 2"].id, templateId, pdfData, status: "approved", submittedBy: users["class.teacher"].id, submittedAt: d("2026-04-01"), approvedBy: users.principal.id, approvedAt: d("2026-04-01"), sentAt: d("2026-04-02"), remarks: "Official synthetic trial report card ready for download." }
    });

    const firstDay = d("2026-09-01");
    for (let i = 0; i < 8; i++) {
      const student = students[i];
      const status = i % 7 === 0 ? "LATE" : "PRESENT";
      await tx.attendanceRecord.upsert({
        where: { schoolId_studentId_attendanceDate_periodId: { schoolId, studentId: student.id, attendanceDate: firstDay, periodId: "DAILY" } },
        update: { classId: student.classId, status, source: "device", recordedBy: users["frontdesk"].id, reason: status === "LATE" ? "Traffic delay" : null, eventIds: [] },
        create: { id: `eug-att-${i + 1}-20260901`, schoolId, studentId: student.id, classId: student.classId, attendanceDate: firstDay, periodId: "DAILY", status, source: "device", recordedBy: users["frontdesk"].id, eventIds: [] }
      });
    }

    const riskSamples = [
      ["attendance_pattern", "MEDIUM", "OPEN", students[3], { trigger: "three late arrivals in a rolling window", recommendedAction: "guardian follow-up" }],
      ["fee_balance", "LOW", "OPEN", students[1], { trigger: "partial term balance", recommendedAction: "billing reminder" }],
      ["academic_support", "HIGH", "OPEN", students[6], { trigger: "below-target mathematics performance", recommendedAction: "academic intervention plan" }]
    ];
    for (let i = 0; i < riskSamples.length; i++) {
      const item = riskSamples[i];
      await tx.studentRiskFlag.upsert({ where: { id: `eug-risk-${i + 1}` }, update: { schoolId, studentId: item[3].id, reason: item[0], detail: item[4], severity: item[1], reviewStatus: item[2] }, create: { id: `eug-risk-${i + 1}`, schoolId, studentId: item[3].id, reason: item[0], detail: item[4], severity: item[1], reviewStatus: item[2] } });
    }

    const deviceApiHash = await hash("eugene-academy-device-key-2026", 12);
    const scanner = await tx.device.upsert({ where: { schoolId_deviceSerial: { schoolId, deviceSerial: "EUG-QR-001" } }, update: { kind: "qr", label: "Main Gate QR Scanner", apiKeyHash: deviceApiHash, status: "active", lastSeenAt: new Date() }, create: { schoolId, deviceSerial: "EUG-QR-001", kind: "qr", label: "Main Gate QR Scanner", apiKeyHash: deviceApiHash, status: "active", lastSeenAt: new Date() } });
    const adminDevice = await tx.device.upsert({ where: { schoolId_deviceSerial: { schoolId, deviceSerial: "EUG-ADMIN-001" } }, update: { kind: "admin", label: "Attendance Office Console", apiKeyHash: deviceApiHash, status: "active", lastSeenAt: new Date() }, create: { schoolId, deviceSerial: "EUG-ADMIN-001", kind: "admin", label: "Attendance Office Console", apiKeyHash: deviceApiHash, status: "active", lastSeenAt: new Date() } });
    for (let i = 0; i < 4; i++) await tx.deviceIdentity.upsert({ where: { schoolId_deviceKind_externalId: { schoolId, deviceKind: "qr", externalId: "EUG-STUDENT-" + (i + 1) } }, update: { studentId: students[i].id, staffId: null }, create: { schoolId, deviceKind: "qr", externalId: "EUG-STUDENT-" + (i + 1), studentId: students[i].id } });
    for (let i = 0; i < 2; i++) { const staffKey = i === 0 ? "frontdesk" : "transport"; await tx.deviceIdentity.upsert({ where: { schoolId_deviceKind_externalId: { schoolId, deviceKind: "admin", externalId: "EUG-STAFF-" + (i + 1) } }, update: { staffId: users[staffKey].id, studentId: null }, create: { schoolId, deviceKind: "admin", externalId: "EUG-STAFF-" + (i + 1), staffId: users[staffKey].id } }); }
    await tx.deviceAttendanceReceipt.upsert({ where: { schoolId_deviceId_idempotencyKey: { schoolId, deviceId: scanner.id, idempotencyKey: "eug-receipt-20260901-0001" } }, update: { processedAt: new Date(), capturedAt: firstDay, nonce: "eug-nonce-0001" }, create: { schoolId, deviceId: scanner.id, idempotencyKey: "eug-receipt-20260901-0001", nonce: "eug-nonce-0001", capturedAt: firstDay, processedAt: new Date() } });
    await tx.deviceAttendanceReceipt.upsert({ where: { schoolId_deviceId_idempotencyKey: { schoolId, deviceId: adminDevice.id, idempotencyKey: "eug-receipt-20260901-0002" } }, update: { processedAt: new Date(), capturedAt: firstDay, nonce: "eug-nonce-0002" }, create: { schoolId, deviceId: adminDevice.id, idempotencyKey: "eug-receipt-20260901-0002", nonce: "eug-nonce-0002", capturedAt: firstDay, processedAt: new Date() } });
`;

if (!patchedSource.includes(anchor)) throw new Error("Fixture anchor not found; refusing unsafe live seed patch.");
patchedSource = patchedSource.replace(anchor, injection + "\n" + anchor);

const platformAnchor = "  const report = {\n";
const platformInjection = String.raw`  await prisma.impersonationLog.upsert({
    where: { id: "eug-impersonation-20260904" },
    update: { platformAdminId: platform.id, schoolId, impersonatedUserId: platform.id, reason: "Synthetic Eugene Academy owner-account support trial", endedAt: new Date() },
    create: { id: "eug-impersonation-20260904", platformAdminId: platform.id, schoolId, impersonatedUserId: platform.id, reason: "Synthetic Eugene Academy owner-account support trial", endedAt: new Date() }
  });
  await prisma.auditLogPlatform.create({ data: { actorId: platform.id, action: "trial_fixture.seeded", targetSchoolId: schoolId, targetEntity: "School", meta: { schoolCode: TEST_CODE, schoolName: TEST_SCHOOL_NAME, source: "eugene-academy-trial" } } });

`;
if (!patchedSource.includes(platformAnchor)) throw new Error("Platform anchor not found; refusing unsafe live seed patch.");
patchedSource = patchedSource.replace(platformAnchor, platformInjection + platformAnchor);

const temp = path.join(__dirname, `.eugene-academy-trial-runtime-${process.pid}.cjs`);
fs.writeFileSync(temp, patchedSource, "utf8");
const cleanup = () => { try { fs.unlinkSync(temp); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

const originalTransaction = PrismaClient.prototype.$transaction;
PrismaClient.prototype.$transaction = function patchedTransaction(arg, options, ...rest) {
  if (typeof arg === "function") return originalTransaction.call(this, arg, { maxWait: 15000, timeout: 180000, ...(options || {}) });
  return originalTransaction.call(this, arg, options, ...rest);
};

console.log(`[eugene-academy-trial] seeding ${schoolName} (${code})`);
require(temp);
