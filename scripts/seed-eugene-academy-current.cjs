#!/usr/bin/env node
/*
 * Current-schema Eugene Academy trial seeder.
 *
 * Safety properties:
 * - requires an explicit opt-in and exact synthetic school identity;
 * - refuses SUPERUSER/BYPASSRLS database roles;
 * - resolves the global login directory outside tenant RLS, then performs every
 *   school-owned operation in one transaction with app.current_school_id set;
 * - is rerunnable and prints summary counts only, never credentials or learner data.
 */
const { PrismaClient, Prisma } = require("@prisma/client");
const { createId } = require("@paralleldrive/cuid2");
const { hash } = require("bcryptjs");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();
const schoolName = String(process.env.TEST_SCHOOL_NAME || "").trim();
const ownerEmail = String(process.env.EUGENE_ACADEMY_OWNER_EMAIL || "").trim().toLowerCase();
const ownerName = String(process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner").trim();
const ownerPassword = String(process.env.EUGENE_ACADEMY_OWNER_PASSWORD || "");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (allow !== "YES") throw new Error("Refusing Eugene Academy trial seed: explicit enable flag is required.");
if (code !== "eug123") throw new Error("Refusing Eugene Academy trial seed: TEST_SCHOOL_CODE must be eug123.");
if (schoolName !== "Eugene Academy") throw new Error("Refusing Eugene Academy trial seed: TEST_SCHOOL_NAME must be Eugene Academy.");
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!ownerEmail || ownerPassword.length < 12) throw new Error("A valid owner email and a password of at least 12 characters are required.");

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const ALL_PERMISSIONS = [
  "students:read","students:write","students:delete","finance:read","finance:write","finance:approve","payroll:view_own","payroll:manage","settings:manage_roles","settings:manage_school","reports:generate","users:read","users:write","audit:read","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:record_assigned","attendance:record_staff","attendance:view_own","attendance:review","attendance:display","attendance:staff_scan","attendance:pickup_approve","scores:write:assigned","scores:write:all","invoices:create","payments:record","payments:reverse","report_cards:submit","report_cards:approve","report_cards:view","parents:read_linked","roles:create_custom","visitors:log","templates:manage","transport:manage","transport:view","feeding:manage","exams:manage","exams:take","library:manage","library:borrow","assets:manage","fees:adjust","fees:approve","recruitment:manage","analytics:view","offline:sync","broadcast:emergency_send","risk_flags:view","ai_drafts:accept","lesson_plans:manage","lesson_plans:review","homework:manage_assigned","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage","communications:manage","exports:students","exports:staff","exports:attendance","exports:finance","exports:gradebook","identity_cards:manage","support:create","support:view_own","support:manage"
];

const ROLE_PERMISSIONS = {
  Owner: ALL_PERMISSIONS,
  Principal: ALL_PERMISSIONS.filter((key) => key !== "students:delete"),
  Accountant: ["students:read","finance:read","finance:write","finance:approve","invoices:create","payments:record","payments:reverse","reports:generate","fees:adjust","fees:approve","analytics:view","support:create","support:view_own"],
  "Class Teacher": ["students:read","attendance:record","attendance:record_assigned","attendance:view_own","attendance:staff_scan","lesson_plans:manage","homework:manage_assigned","scores:write:assigned","report_cards:view","report_cards:submit","exams:manage","exams:take","offline:sync","risk_flags:view","support:create","support:view_own"],
  Parent: ["parents:read_linked","report_cards:view","transport:view","exams:take","library:borrow"],
  Student: []
};

const dt = (value) => new Date(`${value}T00:00:00.000Z`);
const money = (value) => new Prisma.Decimal(value);

async function assertSafeRole() {
  const rows = await db.$queryRawUnsafe(
    `SELECT rolbypassrls AS "bypass", rolsuper AS "superuser" FROM pg_roles WHERE rolname=current_user`,
  );
  if (!rows[0] || rows[0].bypass || rows[0].superuser) {
    throw new Error("Refusing Eugene Academy trial seed: database role must be NOSUPERUSER and NOBYPASSRLS.");
  }
}

async function buildSamplePdf(studentName, admissionNo) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  page.drawText("EUGENE ACADEMY", { x: 48, y: 790, size: 20, font: bold });
  page.drawText("OFFICIAL SYNTHETIC TRIAL REPORT CARD", { x: 48, y: 760, size: 11, font: bold });
  page.drawText(`Student: ${studentName}`, { x: 48, y: 725, size: 11, font: normal });
  page.drawText(`Admission No: ${admissionNo}`, { x: 48, y: 705, size: 10, font: normal });
  page.drawText("Term 2 · 2025/2026", { x: 48, y: 675, size: 10, font: normal });
  page.drawText("Synthetic pilot evidence only — generated by SukuuNova trial seeder.", { x: 48, y: 635, size: 9, font: normal });
  return Buffer.from(await pdf.save());
}

async function main() {
  await assertSafeRole();
  const existingDirectory = await db.schoolLoginDirectory.findUnique({ where: { uniqueCode: code } });
  const schoolId = existingDirectory?.schoolId || createId();
  const passwordHash = await hash(ownerPassword, 10);
  const plan = await db.subscriptionPlan.upsert({
    where: { name: "Foundation" },
    update: { featureFlags: ["payroll","transport","cbt","library","assets","recruitment"] },
    create: { name: "Foundation", price: money(0), featureFlags: ["payroll","transport","cbt","library","assets","recruitment"] },
  });

  const summary = await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", schoolId);

    const school = await tx.school.upsert({
      where: { id: schoolId },
      update: { uniqueCode: code, name: schoolName, status: "active", subscriptionPlanId: plan.id, logoUrl: "/branding/eugene-academy.svg" },
      create: { id: schoolId, uniqueCode: code, name: schoolName, status: "active", subscriptionPlanId: plan.id, logoUrl: "/branding/eugene-academy.svg" },
    });
    await tx.schoolLoginDirectory.upsert({
      where: { schoolId },
      update: { uniqueCode: code, status: "active" },
      create: { schoolId, uniqueCode: code, status: "active" },
    });
    await tx.schoolSettings.upsert({
      where: { schoolId },
      update: { timezone: "Africa/Accra", attendanceGraceMinutes: 10, notificationChannels: { in_app: true, email: false, sms: false, whatsapp: false } },
      create: { schoolId, timezone: "Africa/Accra", attendanceGraceMinutes: 10, notificationChannels: { in_app: true, email: false, sms: false, whatsapp: false } },
    });

    const permissionIds = new Map();
    for (const key of ALL_PERMISSIONS) {
      const row = await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
      permissionIds.set(key, row.id);
    }

    const roleIds = new Map();
    for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await tx.role.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { key: name.toLowerCase().replaceAll(" ", "_"), isSystem: true },
        create: { schoolId, name, key: name.toLowerCase().replaceAll(" ", "_"), isSystem: true },
      });
      roleIds.set(name, role.id);
      for (const key of permissions) {
        const permissionId = permissionIds.get(key);
        if (!permissionId) continue;
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          update: { schoolId },
          create: { schoolId, roleId: role.id, permissionId },
        });
      }
    }

    async function upsertUser(name, email, roleName, phone = null) {
      const user = await tx.user.upsert({
        where: { schoolId_email: { schoolId, email } },
        update: { name, phone, passwordHash, status: "active", needsPasswordChange: false },
        create: { schoolId, name, email, phone, passwordHash, status: "active", needsPasswordChange: false },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleIds.get(roleName) } },
        update: { schoolId },
        create: { schoolId, userId: user.id, roleId: roleIds.get(roleName) },
      });
      return user;
    }

    const owner = await upsertUser(ownerName, ownerEmail, "Owner", "+233240000001");
    const principal = await upsertUser("Eugene Academy Principal", "principal.eug123@test.invalid", "Principal", "+233240000002");
    const accountant = await upsertUser("Eugene Academy Accountant", "accountant.eug123@test.invalid", "Accountant", "+233240000003");
    const teacher = await upsertUser("Eugene Academy Class Teacher", "teacher.eug123@test.invalid", "Class Teacher", "+233240000004");

    const previousYear = await tx.academicYear.upsert({
      where: { schoolId_name: { schoolId, name: "2025/2026" } },
      update: { startDate: dt("2025-09-01"), endDate: dt("2026-07-31") },
      create: { schoolId, name: "2025/2026", startDate: dt("2025-09-01"), endDate: dt("2026-07-31") },
    });
    const currentYear = await tx.academicYear.upsert({
      where: { schoolId_name: { schoolId, name: "2026/2027" } },
      update: { startDate: dt("2026-09-07"), endDate: dt("2027-07-30") },
      create: { schoolId, name: "2026/2027", startDate: dt("2026-09-07"), endDate: dt("2027-07-30") },
    });
    const previousTerm = await tx.term.upsert({
      where: { schoolId_academicYearId_name: { schoolId, academicYearId: previousYear.id, name: "Term 2" } },
      update: { startDate: dt("2026-01-05"), endDate: dt("2026-04-10") },
      create: { schoolId, academicYearId: previousYear.id, name: "Term 2", startDate: dt("2026-01-05"), endDate: dt("2026-04-10") },
    });
    const currentTerm = await tx.term.upsert({
      where: { schoolId_academicYearId_name: { schoolId, academicYearId: currentYear.id, name: "Term 1" } },
      update: { startDate: dt("2026-09-07"), endDate: dt("2026-12-18"), isLocked: false },
      create: { schoolId, academicYearId: currentYear.id, name: "Term 1", startDate: dt("2026-09-07"), endDate: dt("2026-12-18"), isLocked: false },
    });

    const events = [
      ["Term 1 Resumption", "academic", "2026-09-07", "2026-09-07", true, true],
      ["Founders Day", "holiday", "2026-09-21", "2026-09-21", false, false],
      ["Mid-term Break", "break", "2026-10-26", "2026-10-30", false, true],
      ["PTA Open Day", "pta", "2026-11-14", "2026-11-14", false, false],
      ["Mock Examination Week", "exam", "2026-11-23", "2026-11-27", true, false],
      ["Christmas Vacation", "break", "2026-12-19", "2027-01-08", false, false],
    ];
    for (const [name, type, start, end, affectsAttendance, affectsTransport] of events) {
      const exists = await tx.calendarEvent.findFirst({ where: { schoolId, academicYearId: currentYear.id, name } });
      if (!exists) await tx.calendarEvent.create({ data: { schoolId, academicYearId: currentYear.id, name, type, startDate: dt(start), endDate: dt(end), affectsAttendance, affectsTransport } });
    }

    const classNames = ["JHS 1 A", "JHS 2 A", "JHS 3 A"];
    const classes = [];
    for (const [index, name] of classNames.entries()) {
      classes.push(await tx.class.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { level: `JHS ${index + 1}`, classTeacherId: teacher.id },
        create: { schoolId, name, level: `JHS ${index + 1}`, classTeacherId: teacher.id },
      }));
    }
    const subjects = [];
    for (const name of ["Mathematics", "English Language", "Integrated Science", "Social Studies", "ICT"]) {
      subjects.push(await tx.subject.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name } }));
    }
    for (const cls of classes) for (const subject of subjects) {
      await tx.classSubjectTeacher.upsert({
        where: { classId_subjectId_teacherId: { classId: cls.id, subjectId: subject.id, teacherId: teacher.id } },
        update: { schoolId },
        create: { schoolId, classId: cls.id, subjectId: subject.id, teacherId: teacher.id },
      });
    }

    const students = [];
    for (let i = 0; i < 24; i++) {
      const admissionNo = `EUG-${String(i + 1).padStart(4, "0")}`;
      const cls = classes[i % classes.length];
      const first = ["Kwame","Ama","Kojo","Abena","Yaw","Akosua","Kofi","Esi"][i % 8];
      const last = ["Mensah","Owusu","Boateng"][Math.floor(i / 8) % 3];
      students.push(await tx.student.upsert({
        where: { schoolId_admissionNo: { schoolId, admissionNo } },
        update: { name: `${first} ${last}`, classId: cls.id, status: "active" },
        create: { schoolId, admissionNo, name: `${first} ${last}`, classId: cls.id, status: "active" },
      }));
    }

    const guardians = [];
    for (let i = 0; i < 8; i++) {
      const email = `guardian${i + 1}.eug123@test.invalid`;
      const phone = `+23324001${String(i + 1).padStart(4, "0")}`;
      const guardianUser = await upsertUser(`Guardian ${i + 1}`, email, "Parent", phone);
      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId, phone } },
        update: { name: `Guardian ${i + 1}`, email, userId: guardianUser.id },
        create: { schoolId, name: `Guardian ${i + 1}`, email, phone, userId: guardianUser.id },
      });
      guardians.push(guardian);
      for (const student of students.slice(i * 3, i * 3 + 3)) {
        await tx.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
          update: { schoolId, relationship: "Parent", isPrimary: true },
          create: { schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent", isPrimary: true },
        });
      }
    }

    const assessments = [];
    for (const cls of classes) for (const subject of subjects) {
      for (const [name, type, weight] of [["Continuous Assessment", "ca", 40], ["End of Term Examination", "exam", 60]]) {
        assessments.push(await tx.assessment.upsert({
          where: { schoolId_termId_classId_subjectId_name: { schoolId, termId: currentTerm.id, classId: cls.id, subjectId: subject.id, name } },
          update: { type, weight: money(weight), maxScore: money(100) },
          create: { schoolId, termId: currentTerm.id, classId: cls.id, subjectId: subject.id, name, type, weight: money(weight), maxScore: money(100) },
        }));
      }
    }
    for (const student of students) {
      const studentAssessments = assessments.filter((assessment) => assessment.classId === student.classId);
      for (let i = 0; i < studentAssessments.length; i++) {
        const assessment = studentAssessments[i];
        const value = 55 + ((students.indexOf(student) * 7 + i * 3) % 36);
        await tx.score.upsert({
          where: { studentId_assessmentId: { studentId: student.id, assessmentId: assessment.id } },
          update: { value: money(value), enteredBy: teacher.id, subjectId: assessment.subjectId, status: "present" },
          create: { schoolId, studentId: student.id, subjectId: assessment.subjectId, assessmentId: assessment.id, value: money(value), enteredBy: teacher.id, status: "present" },
        });
      }
    }

    const templateId = "eugene-academy-standard-report-card";
    const template = await tx.reportCardTemplate.upsert({
      where: { id: templateId },
      update: { schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, sections: ["identity","subjects","attendance","remarks","approval"] } },
      create: { id: templateId, schoolId, name: "Eugene Academy Standard Report Card", layoutConfig: { version: 1, sections: ["identity","subjects","attendance","remarks","approval"] } },
    });
    await tx.schoolSettings.update({
      where: { schoolId },
      data: { reportCardTemplateId: template.id, reportCardConfig: { templateId: template.id, generatedSample: true }, timetableConfig: { schoolDays: [1,2,3,4,5], periodsPerDay: 6, firstPeriod: "08:00", periodMinutes: 50 } },
    });

    for (const student of students.slice(0, 6)) {
      const pdfData = await buildSamplePdf(student.name, student.admissionNo);
      await tx.reportCard.upsert({
        where: { studentId_termId: { studentId: student.id, termId: previousTerm.id } },
        update: { templateId: template.id, pdfData, status: "approved", approvedBy: principal.id, approvedAt: dt("2026-04-09"), sentAt: dt("2026-04-10"), calculationSnapshot: { version: 1, syntheticTrial: true }, remarks: "Synthetic trial report card." },
        create: { schoolId, studentId: student.id, termId: previousTerm.id, templateId: template.id, pdfData, status: "approved", approvedBy: principal.id, approvedAt: dt("2026-04-09"), sentAt: dt("2026-04-10"), calculationSnapshot: { version: 1, syntheticTrial: true }, remarks: "Synthetic trial report card." },
      });
    }

    const feeByClass = new Map();
    for (const cls of classes) {
      const existing = await tx.feeItem.findFirst({ where: { schoolId, termId: currentTerm.id, classId: cls.id, name: "Tuition" } });
      const fee = existing || await tx.feeItem.create({ data: { schoolId, termId: currentTerm.id, classId: cls.id, name: "Tuition", amount: money(2100) } });
      feeByClass.set(cls.id, fee);
    }
    for (const student of students) {
      const invoice = await tx.invoice.upsert({
        where: { studentId_termId: { studentId: student.id, termId: currentTerm.id } },
        update: { totalAmount: money(2100) },
        create: { schoolId, studentId: student.id, termId: currentTerm.id, totalAmount: money(2100), status: "unpaid" },
      });
      const fee = feeByClass.get(student.classId);
      await tx.invoiceLine.upsert({
        where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: fee.id } },
        update: { schoolId, amount: fee.amount },
        create: { schoolId, invoiceId: invoice.id, feeItemId: fee.id, amount: fee.amount },
      });
    }
    const firstInvoice = await tx.invoice.findFirst({ where: { schoolId, studentId: students[0].id, termId: currentTerm.id } });
    const paymentRef = "EUG-TRIAL-PAYMENT-001";
    if (firstInvoice && !(await tx.payment.findFirst({ where: { schoolId, reference: paymentRef } }))) {
      await tx.payment.create({ data: { schoolId, invoiceId: firstInvoice.id, amount: money(500), method: "cash", reference: paymentRef, reconciledBy: accountant.id } });
    }

    for (const [classIndex, cls] of classes.entries()) {
      for (let day = 1; day <= 5; day++) {
        const subject = subjects[(classIndex + day - 1) % subjects.length];
        await tx.timetableSlot.upsert({
          where: { schoolId_classId_dayOfWeek_period: { schoolId, classId: cls.id, dayOfWeek: day, period: 1 } },
          update: { subjectId: subject.id, teacherId: teacher.id, venue: cls.name },
          create: { schoolId, classId: cls.id, subjectId: subject.id, teacherId: teacher.id, dayOfWeek: day, period: 1, venue: cls.name },
        });
      }
    }

    const attendanceDate = dt("2026-09-10");
    for (const student of students.slice(0, 8)) {
      const existing = await tx.attendanceEvent.findFirst({ where: { schoolId, studentId: student.id, attendanceDate, periodId: "DAILY", type: "in" } });
      if (!existing) await tx.attendanceEvent.create({ data: { schoolId, studentId: student.id, type: "in", method: "manual", timestamp: new Date("2026-09-10T07:45:00.000Z"), attendanceDate, isLate: false, recordedBy: teacher.id, periodId: "DAILY" } });
    }

    await tx.identityCard.upsert({
      where: { serial: "EUG-STUDENT-0001" },
      update: { schoolId, personType: "student", studentId: students[0].id, staffId: null, expiresAt: dt("2027-07-31"), status: "active" },
      create: { schoolId, personType: "student", studentId: students[0].id, serial: "EUG-STUDENT-0001", expiresAt: dt("2027-07-31"), status: "active" },
    });
    await tx.identityCard.upsert({
      where: { serial: "EUG-STAFF-0001" },
      update: { schoolId, personType: "staff", studentId: null, staffId: teacher.id, expiresAt: dt("2027-07-31"), status: "active" },
      create: { schoolId, personType: "staff", staffId: teacher.id, serial: "EUG-STAFF-0001", expiresAt: dt("2027-07-31"), status: "active" },
    });

    return {
      school: { id: school.id, name: school.name, code: school.uniqueCode },
      counts: {
        users: await tx.user.count({ where: { schoolId } }),
        students: await tx.student.count({ where: { schoolId } }),
        guardians: await tx.guardian.count({ where: { schoolId } }),
        classes: await tx.class.count({ where: { schoolId } }),
        subjects: await tx.subject.count({ where: { schoolId } }),
        academicYears: await tx.academicYear.count({ where: { schoolId } }),
        terms: await tx.term.count({ where: { schoolId } }),
        assessments: await tx.assessment.count({ where: { schoolId } }),
        reportCards: await tx.reportCard.count({ where: { schoolId } }),
        invoices: await tx.invoice.count({ where: { schoolId } }),
        identityCards: await tx.identityCard.count({ where: { schoolId } }),
      },
    };
  }, { maxWait: 60000, timeout: 300000 });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
