#!/usr/bin/env node
/*
 * SukuuNova realistic synthetic-school fixture.
 *
 * SAFETY: this script refuses to run unless TEST_DATABASE_URL is present and
 * different from DATABASE_URL. It changes DATABASE_URL in-process to the
 * isolated test database before constructing PrismaClient.
 *
 * The fixture is intentionally synthetic and idempotent enough to be re-run
 * with the same TEST_SCHOOL_CODE. It never writes credentials to its report.
 */
const { PrismaClient, Prisma } = require("@prisma/client");
const { createId } = require("@paralleldrive/cuid2");
const { hash } = require("bcryptjs");
const fs = require("fs");
const path = require("path");

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required.`);
  return value.trim();
}

const testUrl = required("TEST_DATABASE_URL");
const productionUrl = process.env.DATABASE_URL;
if (productionUrl && productionUrl.trim() === testUrl.trim()) {
  throw new Error("REFUSING TO RUN: TEST_DATABASE_URL equals DATABASE_URL.");
}
process.env.DATABASE_URL = testUrl;

const prisma = new PrismaClient();
const TEST_CODE = (process.env.TEST_SCHOOL_CODE || "sn-test-2026").toLowerCase();
const TEST_SCHOOL_NAME = process.env.TEST_SCHOOL_NAME || "SukuuNova Demonstration Academy";
const PASSWORD = process.env.TEST_SEED_PASSWORD || "SukuuTest!2026";
const requestedStudentCount = Number(process.env.TEST_STUDENT_COUNT || 90);
if (PASSWORD.length < 12) throw new Error("TEST_SEED_PASSWORD must be at least 12 characters.");
if (!Number.isInteger(requestedStudentCount) || requestedStudentCount < 1 || requestedStudentCount > 500) {
  throw new Error("TEST_STUDENT_COUNT must be an integer between 1 and 500.");
}
const STUDENT_COUNT = requestedStudentCount;

const roles = [
  ["Owner", "owner"], ["Principal", "principal"], ["Accountant", "accountant"],
  ["Class Teacher", "class_teacher"], ["Subject Teacher", "subject_teacher"],
  ["HR Officer", "hr_officer"], ["Transport Officer", "transport_officer"],
  ["Front Desk/Gate Security", "front_desk_gate_security"], ["Parent", "parent"], ["Student", "student"],
  ["Academic Coordinator", "academic_coordinator"], ["Department Head", "department_head"],
  ["Admissions Officer", "admissions_officer"]
];

const rolePermissions = {
  Owner: ["students:read","students:write","students:delete","finance:read","finance:write","finance:approve","payroll:view_own","payroll:manage","settings:manage_roles","settings:manage_school","reports:generate","users:read","users:write","audit:read","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:record_assigned","attendance:record_staff","attendance:view_own","attendance:review","attendance:pickup_approve","scores:write:assigned","scores:write:all","invoices:create","payments:record","payments:reverse","report_cards:submit","report_cards:approve","report_cards:view","parents:read_linked","roles:create_custom","visitors:log","templates:manage","transport:manage","transport:view","feeding:manage","exams:manage","exams:take","library:manage","library:borrow","assets:manage","fees:adjust","fees:approve","recruitment:manage","analytics:view","offline:sync","broadcast:emergency_send","risk_flags:view","ai_drafts:accept","lesson_plans:manage","lesson_plans:review","homework:manage_assigned","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage","exports:students","exports:staff","exports:attendance","exports:finance","exports:gradebook"],
  Principal: ["students:read","finance:read","payroll:view_own","settings:manage_school","reports:generate","users:read","audit:read","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:record_staff","attendance:review","scores:write:all","report_cards:submit","report_cards:approve","report_cards:view","exams:manage","library:manage","transport:view","feeding:manage","analytics:view","risk_flags:view","exports:students","exports:staff","exports:attendance","exports:finance","exports:gradebook","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage","payments:reverse"],
  Accountant: ["students:read","finance:read","finance:write","finance:approve","invoices:create","payments:record","payments:reverse","reports:generate","payroll:view_own","feeding:manage","fees:adjust","fees:approve","analytics:view","exports:students","exports:finance"],
  "Class Teacher": ["students:read","attendance:record","attendance:record_assigned","attendance:view_own","lesson_plans:manage","homework:manage_assigned","scores:write:assigned","report_cards:view","exams:manage","exams:take","offline:sync","ai_drafts:accept","report_cards:submit","payroll:view_own","risk_flags:view"],
  "Subject Teacher": ["students:read","lesson_plans:manage","homework:manage_assigned","scores:write:assigned","attendance:view_own","report_cards:view","exams:manage","exams:take","offline:sync","ai_drafts:accept","payroll:view_own"],
  "HR Officer": ["students:read","attendance:record","attendance:record_staff","attendance:view_own","payroll:view_own","payroll:manage","users:read","users:write","reports:generate","recruitment:manage","analytics:view","exports:staff","exports:attendance"],
  "Transport Officer": ["students:read","payroll:view_own","transport:manage","transport:view","offline:sync"],
  "Front Desk/Gate Security": ["students:read","attendance:record","attendance:record_all","attendance:view_own","attendance:pickup_approve","visitors:log","payroll:view_own"],
  Parent: ["parents:read_linked","report_cards:view","transport:view","exams:take","library:borrow"],
  Student: [],
  "Academic Coordinator": ["students:read","users:read","reports:generate","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:review","scores:write:all","report_cards:submit","report_cards:approve","report_cards:view","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage"],
  "Department Head": ["students:read","reports:generate","attendance:record","attendance:record_all","attendance:review","scores:write:all","report_cards:submit","report_cards:view","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view"],
  "Admissions Officer": ["students:read","students:write","reports:generate","payroll:view_own"]
};

function uid() { return createId(); }
function email(slug) { return `${slug}.${TEST_CODE}@test.sukuunova.local`; }
function phone(n) { return `+233240${String(100000 + n).slice(-6)}`; }
function d(value) { return new Date(`${value}T00:00:00.000Z`); }
async function setTenant(tx, schoolId) { await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId); }
async function exec(tx, sql, ...params) { return tx.$executeRawUnsafe(sql, ...params); }

async function main() {
  const now = new Date();
  const passwordHash = await hash(PASSWORD, 12);

  const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: TEST_CODE } });
  const schoolId = directory?.schoolId || uid();
  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: "Foundation" },
    update: { featureFlags: ["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"] },
    create: { name: "Foundation", price: new Prisma.Decimal(0), featureFlags: ["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"] }
  });

  const report = await prisma.$transaction(async (tx) => {
    await setTenant(tx, schoolId);

    await tx.school.upsert({
      where: { id: schoolId },
      update: { uniqueCode: TEST_CODE, name: TEST_SCHOOL_NAME, status: "active", subscriptionPlanId: plan.id },
      create: { id: schoolId, uniqueCode: TEST_CODE, name: TEST_SCHOOL_NAME, status: "active", subscriptionPlanId: plan.id }
    });
    await tx.schoolLoginDirectory.upsert({
      where: { schoolId },
      update: { uniqueCode: TEST_CODE, status: "active" },
      create: { schoolId, uniqueCode: TEST_CODE, status: "active" }
    });
    await tx.schoolSettings.upsert({
      where: { schoolId },
      update: { timezone: "Africa/Accra", attendanceGraceMinutes: 10, gradingScale: { A1: 80, B2: 70, B3: 65, C4: 60, C5: 55, C6: 50, D7: 45, E8: 40, F9: 0 }, notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false } },
      create: { schoolId, timezone: "Africa/Accra", attendanceGraceMinutes: 10, gradingScale: { A1: 80, B2: 70, B3: 65, C4: 60, C5: 55, C6: 50, D7: 45, E8: 40, F9: 0 }, notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false } }
    });

    const roleIds = new Map();
    for (const [name, key] of roles) {
      const role = await tx.role.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { key, isSystem: true },
        create: { schoolId, name, key, isSystem: true }
      });
      roleIds.set(name, role.id);
    }
    for (const [roleName, permissionKeys] of Object.entries(rolePermissions)) {
      const roleId = roleIds.get(roleName);
      if (!roleId) throw new Error(`Role was not created: ${roleName}`);
      for (const key of permissionKeys) {
        const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: permission.id } },
          update: { schoolId },
          create: { schoolId, roleId, permissionId: permission.id }
        });
      }
    }

    const academicYear = await tx.academicYear.upsert({
      where: { schoolId_name: { schoolId, name: "2025/2026" } },
      update: { startDate: d("2025-09-01"), endDate: d("2026-07-31"), isLocked: false },
      create: { schoolId, name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-07-31"), isLocked: false }
    });
    const termMap = {};
    for (const [name, startDate, endDate] of [
      ["Term 1", "2025-09-01", "2025-12-19"],
      ["Term 2", "2026-01-05", "2026-04-10"],
      ["Term 3", "2026-04-20", "2026-07-31"]
    ]) {
      termMap[name] = await tx.term.upsert({
        where: { schoolId_academicYearId_name: { schoolId, academicYearId: academicYear.id, name } },
        update: { startDate: d(startDate), endDate: d(endDate), isLocked: false },
        create: { schoolId, academicYearId: academicYear.id, name, startDate: d(startDate), endDate: d(endDate), isLocked: false }
      });
    }

    const houseDefs = [
      ["Adom House", "ADOM", "#2563eb"],
      ["Nkrumah House", "NKR", "#059669"],
      ["Asante House", "ASA", "#f59e0b"],
      ["Anloga House", "ANL", "#dc2626"]
    ];
    const houses = [];
    for (const [name, code, color] of houseDefs) {
      houses.push(await tx.house.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { code, color, isActive: true },
        create: { schoolId, name, code, color, isActive: true }
      }));
    }

    const classes = [];
    for (const name of ["JHS 1 A","JHS 1 B","JHS 2 A","JHS 2 B","JHS 3 A","JHS 3 B","Primary 5","Primary 6","Creche"]) {
      classes.push(await tx.class.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { level: name.startsWith("JHS") ? "JHS" : name.startsWith("Primary") ? "PRIMARY" : "EARLY_YEARS" },
        create: { schoolId, name, level: name.startsWith("JHS") ? "JHS" : name.startsWith("Primary") ? "PRIMARY" : "EARLY_YEARS" }
      }));
    }

    const subjects = [];
    for (const name of ["Mathematics","English Language","Integrated Science","Social Studies","ICT","French","Creative Arts","Religious and Moral Education"]) {
      subjects.push(await tx.subject.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name } }));
    }

    const users = {};
    const accountDefs = [
      ["Ama Mensah","owner","Owner"], ["Kofi Boateng","principal","Principal"], ["Linda Owusu","accountant","Accountant"],
      ["Yaw Asare","class.teacher","Class Teacher"], ["Esi Tetteh","subject.teacher","Subject Teacher"], ["Mavis Marfo","hr","HR Officer"],
      ["Daniel Badu","transport","Transport Officer"], ["Naa Addo","frontdesk","Front Desk/Gate Security"], ["Sena Ofori","academic","Academic Coordinator"]
    ];
    for (let index = 0; index < accountDefs.length; index += 1) {
      const [name, slug, roleName] = accountDefs[index];
      const userEmail = email(slug);
      const userPhone = phone(50 + index);
      const user = await tx.user.upsert({
        where: { schoolId_email: { schoolId, email: userEmail } },
        update: { name, phone: userPhone, passwordHash, status: "active", needsPasswordChange: false },
        create: { schoolId, name, email: userEmail, phone: userPhone, passwordHash, status: "active", needsPasswordChange: false }
      });
      users[slug] = user;
      const roleId = roleIds.get(roleName);
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: { schoolId },
        create: { schoolId, userId: user.id, roleId }
      });
    }

    const firstNames = ["Kwesi","Ama","Kojo","Abena","Yaw","Akua","Kofi","Esi","Mavis","Daniel","Naa","Fiifi","Adjoa","Sena","Elikem"];
    const lastNames = ["Mensah","Owusu","Boateng","Asare","Addo","Tetteh","Ofori","Sarpong","Badu","Marfo"];
    const students = [];
    const studentsByClass = new Map(classes.map((classroom) => [classroom.id, []]));
    for (let index = 0; index < STUDENT_COUNT; index += 1) {
      const classroom = classes[index % classes.length];
      const admissionNo = `SNT-${String(index + 1).padStart(4, "0")}`;
      const name = `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
      const dob = d(`${2010 + (index % 5)}-${String((index % 12) + 1).padStart(2,"0")}-${String((index % 27) + 1).padStart(2,"0")}`);
      const student = await tx.student.upsert({
        where: { schoolId_admissionNo: { schoolId, admissionNo } },
        update: { name, dob, classId: classroom.id, houseId: houses[index % houses.length].id, status: "active" },
        create: { schoolId, admissionNo, name, dob, classId: classroom.id, houseId: houses[index % houses.length].id, status: "active" }
      });
      students.push(student);
      studentsByClass.get(classroom.id).push(student);
    }

    const parentRoleId = roleIds.get("Parent");
    for (let index = 0; index < 50; index += 1) {
      const guardianPhone = phone(100 + index);
      const guardianEmail = email(`guardian${index + 1}`);
      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId, phone: guardianPhone } },
        update: { name: `Guardian ${index + 1}`, email: guardianEmail },
        create: { schoolId, name: `Guardian ${index + 1}`, phone: guardianPhone, email: guardianEmail }
      });
      const guardianUser = await tx.user.upsert({
        where: { schoolId_email: { schoolId, email: guardianEmail } },
        update: { name: guardian.name, phone: guardianPhone, passwordHash, status: "active", needsPasswordChange: false },
        create: { schoolId, name: guardian.name, email: guardianEmail, phone: guardianPhone, passwordHash, status: "active", needsPasswordChange: false }
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: guardianUser.id, roleId: parentRoleId } },
        update: { schoolId },
        create: { schoolId, userId: guardianUser.id, roleId: parentRoleId }
      });
      await tx.guardian.update({ where: { id: guardian.id }, data: { userId: guardianUser.id } });
      const childIndexes = index % 10 === 0 ? [index, (index + 50) % students.length] : [index];
      for (let childPosition = 0; childPosition < childIndexes.length; childPosition += 1) {
        const student = students[childIndexes[childPosition]];
        await tx.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
          update: { schoolId, relationship: "Parent", isPrimary: childPosition === 0 },
          create: { schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent", isPrimary: childPosition === 0 }
        });
      }
    }

    for (let day = 0; day < 30; day += 1) {
      const eventDate = new Date(now);
      eventDate.setUTCDate(eventDate.getUTCDate() - day);
      if ([0, 6].includes(eventDate.getUTCDay())) continue;
      const attendanceDate = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()));
      for (let index = 0; index < students.length; index += 1) {
        const student = students[index];
        const mode = (index + day) % 10;
        await exec(
          tx,
          `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          uid(), schoolId, student.id, mode === 9 ? "out" : "in", mode === 0 ? "qr" : "manual", eventDate, attendanceDate, mode === 8, users["class.teacher"].id
        );
      }
    }
    const conflictStudent = students[0];
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'in','device',$4,$5,false,$6) ON CONFLICT DO NOTHING`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users.transport.id);
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'out','manual',$4,$5,false,$6) ON CONFLICT DO NOTHING`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users.frontdesk.id);

    const assessments = [];
    for (const term of Object.values(termMap)) {
      for (const classroom of classes) {
        for (const subject of subjects) {
          for (const definition of [["Continuous Assessment", "ca", 40], ["End of Term Examination", "exam", 60]]) {
            const [name, type, weight] = definition;
            assessments.push({
              assessment: await tx.assessment.upsert({
                where: { schoolId_termId_classId_subjectId_name: { schoolId, termId: term.id, classId: classroom.id, subjectId: subject.id, name } },
                update: { type, weight: new Prisma.Decimal(weight), maxScore: new Prisma.Decimal(100) },
                create: { schoolId, termId: term.id, classId: classroom.id, subjectId: subject.id, name, type, weight: new Prisma.Decimal(weight), maxScore: new Prisma.Decimal(100) }
              }),
              classroom,
              subject,
              term
            });
          }
        }
      }
    }
    for (const row of assessments) {
      const classStudents = studentsByClass.get(row.classroom.id) || [];
      for (let index = 0; index < classStudents.length; index += 1) {
        const value = 45 + ((index + row.subject.name.length + row.term.name.length + (row.assessment.type === "exam" ? 7 : 0)) % 45);
        await tx.score.upsert({
          where: { studentId_assessmentId: { studentId: classStudents[index].id, assessmentId: row.assessment.id } },
          update: { value: new Prisma.Decimal(value), status: "present", enteredBy: users["subject.teacher"].id },
          create: { schoolId, studentId: classStudents[index].id, subjectId: row.subject.id, assessmentId: row.assessment.id, value: new Prisma.Decimal(value), status: "present", enteredBy: users["subject.teacher"].id }
        });
      }
    }

    await tx.reportCard.upsert({
      where: { studentId_termId: { studentId: students[0].id, termId: termMap["Term 2"].id } },
      update: { status: "approved", approvedBy: users.principal.id, approvedAt: d("2026-04-01"), calculationSnapshot: { calculationVersion: 1, subjects: subjects.map((subject) => subject.name) }, calculationVersion: 1, remarks: "Consistent effort across a broad subject load." },
      create: { schoolId, studentId: students[0].id, termId: termMap["Term 2"].id, status: "approved", approvedBy: users.principal.id, approvedAt: d("2026-04-01"), calculationSnapshot: { calculationVersion: 1, subjects: subjects.map((subject) => subject.name) }, calculationVersion: 1, remarks: "Consistent effort across a broad subject load." }
    });

    const feeItemsByTerm = new Map();
    for (const term of Object.values(termMap)) {
      const items = [];
      for (const [name, amount] of [["Tuition", 1800], ["ICT Levy", 180], ["Activities", 120]]) {
        items.push(await tx.feeItem.upsert({
          where: { schoolId_termId_classId_name: { schoolId, termId: term.id, classId: null, name } },
          update: { amount: new Prisma.Decimal(amount) },
          create: { schoolId, name, amount: new Prisma.Decimal(amount), termId: term.id, classId: null }
        }));
      }
      feeItemsByTerm.set(term.id, items);
    }

    for (const term of Object.values(termMap)) {
      const feeItems = feeItemsByTerm.get(term.id) || [];
      for (const student of students) {
        const invoice = await tx.invoice.upsert({
          where: { studentId_termId: { studentId: student.id, termId: term.id } },
          update: { totalAmount: new Prisma.Decimal(2100), status: "unpaid" },
          create: { schoolId, studentId: student.id, termId: term.id, totalAmount: new Prisma.Decimal(2100), status: "unpaid" }
        });
        for (const item of feeItems) {
          await tx.invoiceLine.upsert({
            where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: item.id } },
            update: { schoolId, amount: item.amount },
            create: { schoolId, invoiceId: invoice.id, feeItemId: item.id, amount: item.amount }
          });
        }
      }
    }

    const sampleInvoice = await tx.invoice.findFirst({ where: { schoolId, studentId: students[0].id, termId: termMap["Term 3"].id } });
    if (sampleInvoice) {
      const reference = `${TEST_CODE.toUpperCase()}-SAMPLE-PAYMENT`;
      await tx.payment.upsert({
        where: { schoolId_reference: { schoolId, reference } },
        update: { invoiceId: sampleInvoice.id, amount: new Prisma.Decimal(900), method: "mobile_money" },
        create: { schoolId, invoiceId: sampleInvoice.id, amount: new Prisma.Decimal(900), method: "mobile_money", reference }
      });
      await tx.invoice.update({ where: { id: sampleInvoice.id }, data: { status: "part_paid" } });
    }

    const accounts = Object.values(users).map((user) => ({ name: user.name, email: user.email }));
    return {
      generatedAt: new Date().toISOString(),
      school: { id: schoolId, code: TEST_CODE, name: TEST_SCHOOL_NAME },
      summary: { students: students.length, classes: classes.length, subjects: subjects.length, guardians: 50, terms: Object.keys(termMap).length, invoices: students.length * Object.keys(termMap).length },
      accounts
    };
  }, { maxWait: 15000, timeout: 300000 });

  fs.writeFileSync(path.join(__dirname, ".realistic-test-school-output.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
