#!/usr/bin/env node
/*
 * SukuuNova realistic synthetic-school fixture.
 *
 * SAFETY: this script refuses to run unless TEST_DATABASE_URL is present and
 * different from DATABASE_URL. It changes DATABASE_URL in-process to the
 * isolated test database before constructing PrismaClient.
 *
 * The fixture is intentionally synthetic and may be reset/re-run with the
 * same TEST_SCHOOL_CODE. It does not create or touch production-school data.
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
if (PASSWORD.length < 12) throw new Error("TEST_SEED_PASSWORD must be at least 12 characters.");

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
function phone(n) { return `+233240${String(100000+n).slice(-6)}`; }
function d(s) { return new Date(`${s}T00:00:00.000Z`); }
function schoolScopedId() { return uid(); }
async function setTenant(tx, schoolId) { await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId); }
async function exec(tx, sql, ...params) { return tx.$executeRawUnsafe(sql, ...params); }

async function main() {
  const now = new Date();
  const passwordsHash = await hash(PASSWORD, 12);
  const audit = [];
  const credentials = [];

  const schoolExisting = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: TEST_CODE } });
  const schoolId = schoolExisting?.schoolId || uid();
  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: "Foundation" }, update: { featureFlags: ["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"] },
    create: { name: "Foundation", price: new Prisma.Decimal(0), featureFlags: ["face_recognition","payroll","transport","feeding","cbt","library","assets","recruitment"] }
  });

  await prisma.$transaction(async (tx) => {
    await setTenant(tx, schoolId);

    await tx.school.upsert({ where: { id: schoolId }, update: { uniqueCode: TEST_CODE, name: TEST_SCHOOL_NAME, status: "active", subscriptionPlanId: plan.id, logoUrl: "https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg" }, create: { id: schoolId, uniqueCode: TEST_CODE, name: TEST_SCHOOL_NAME, status: "active", subscriptionPlanId: plan.id, logoUrl: "https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg" } });
    await tx.schoolLoginDirectory.upsert({ where: { schoolId }, update: { uniqueCode: TEST_CODE, status: "active" }, create: { schoolId, uniqueCode: TEST_CODE, status: "active" } });
    await tx.schoolSettings.upsert({ where: { schoolId }, update: { timezone: "Africa/Accra", attendanceGraceMinutes: 10, gradingScale: { A1: 80, B2: 70, B3: 65, C4: 60, C5: 55, C6: 50, D7: 45, E8: 40, F9: 0 }, notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false } }, create: { schoolId, timezone: "Africa/Accra", attendanceGraceMinutes: 10, gradingScale: { A1: 80, B2: 70, B3: 65, C4: 60, C5: 55, C6: 50, D7: 45, E8: 40, F9: 0 }, notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false } } });

    const permissions = new Map();
    for (const key of new Set(Object.values(rolePermissions).flat())) {
      const p = await tx.permission.upsert({ where: { key }, update: {}, create: { key, description: `Test fixture permission ${key}` } });
      permissions.set(key, p.id);
    }
    const roleIds = new Map();
    for (const [name, key] of roles) {
      const role = await tx.role.upsert({ where: { schoolId_name: { schoolId, name } }, update: { key, isSystem: true }, create: { schoolId, name, key, isSystem: true } });
      roleIds.set(name, role.id);
      for (const perm of rolePermissions[name] || []) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permissions.get(perm) } }, update: { schoolId }, create: { schoolId, roleId: role.id, permissionId: permissions.get(perm) } });
    }

    const owner = await tx.user.upsert({ where: { schoolId_email: { schoolId, email: email("owner") } }, update: { name: "Ama Mensah", passwordHash: passwordsHash, status: "active", needsPasswordChange: false }, create: { schoolId, name: "Ama Mensah", email: email("owner"), phone: phone(1), passwordHash: passwordsHash, status: "active" } });
    await tx.userRole.upsert({ where: { userId_roleId: { userId: owner.id, roleId: roleIds.get("Owner") } }, update: { schoolId }, create: { schoolId, userId: owner.id, roleId: roleIds.get("Owner") } });
    credentials.push({ type: "school", role: "Owner", name: owner.name, email: owner.email, password: PASSWORD, schoolCode: TEST_CODE });

    const staffSpecs = [
      ["principal", "Principal", "Kwame Boateng", 2], ["accountant", "Accountant", "Akosua Asare", 3],
      ["class.teacher", "Class Teacher", "Nana Owusu", 4], ["subject.teacher", "Subject Teacher", "Esi Addo", 5],
      ["hr", "HR Officer", "Yaw Ofori", 6], ["transport", "Transport Officer", "Kofi Antwi", 7],
      ["frontdesk", "Front Desk/Gate Security", "Mabel Sarpong", 8], ["academic", "Academic Coordinator", "Adwoa Badu", 9],
      ["depthead", "Department Head", "Daniel Tetteh", 10], ["admissions", "Admissions Officer", "Akua Marfo", 11]
    ];
    const users = { owner };
    for (const [slug, roleName, name, n] of staffSpecs) {
      const u = await tx.user.upsert({ where: { schoolId_email: { schoolId, email: email(slug) } }, update: { name, passwordHash: passwordsHash, phone: phone(n), status: "active", needsPasswordChange: false }, create: { schoolId, name, email: email(slug), phone: phone(n), passwordHash: passwordsHash, status: "active", needsPasswordChange: false } });
      await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: roleIds.get(roleName) } }, update: { schoolId }, create: { schoolId, userId: u.id, roleId: roleIds.get(roleName) } });
      users[slug] = u;
      credentials.push({ type: "school", role: roleName, name, email: u.email, password: PASSWORD, schoolCode: TEST_CODE });
    }

    const years = [
      ["2024/2025", "2024-09-02", "2025-07-25", true],
      ["2025/2026", "2025-09-08", "2026-07-24", true],
      ["2026/2027", "2026-09-07", "2027-07-23", false]
    ];
    const yearsMap = {};
    for (const [name, start, end, locked] of years) yearsMap[name] = await tx.academicYear.upsert({ where: { schoolId_name: { schoolId, name } }, update: { startDate: d(start), endDate: d(end), isLocked: locked }, create: { schoolId, name, startDate: d(start), endDate: d(end), isLocked: locked } });

    const termMap = {};
    const termDefs = [
      ["2025/2026", "Term 1", "2025-09-08", "2025-12-19", true], ["2025/2026", "Term 2", "2026-01-05", "2026-04-02", true], ["2025/2026", "Term 3", "2026-04-20", "2026-07-24", false]
    ];
    for (const [yearName, name, start, end, locked] of termDefs) termMap[name] = await tx.term.upsert({ where: { schoolId_academicYearId_name: { schoolId, academicYearId: yearsMap[yearName].id, name } }, update: { startDate: d(start), endDate: d(end), isLocked: locked }, create: { schoolId, academicYearId: yearsMap[yearName].id, name, startDate: d(start), endDate: d(end), isLocked: locked } });

    const houses = [];
    for (const [name, code, color] of [["Aqua House","AQU","#0f766e"],["Gold House","GLD","#a15c00"],["Coral House","CRL","#b42318"],["Indigo House","IND","#175cd3"]]) houses.push(await tx.house.upsert({ where: { schoolId_name: { schoolId, name } }, update: { code, color, description: `${name} community house` }, create: { schoolId, name, code, color, description: `${name} community house` } }));

    const classLevels = [["JHS 1", "JHS1"], ["JHS 2", "JHS2"], ["JHS 3", "JHS3"]];
    const classes = [];
    for (const [level, code] of classLevels) for (const section of ["A","B","C"]) {
      const name = `${code} ${section}`;
      const teacher = section === "A" ? users["class.teacher"] : section === "B" ? users["subject.teacher"] : users.principal;
      classes.push(await tx.class.upsert({ where: { schoolId_name: { schoolId, name } }, update: { level, classTeacherId: teacher?.id || null }, create: { schoolId, name, level, classTeacherId: teacher?.id || null } }));
    }

    const subjectNames = ["English Language","Mathematics","Integrated Science","Social Studies","Computing","French","Creative Arts","Physical Education"];
    const subjects = [];
    for (const name of subjectNames) subjects.push(await tx.subject.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name } }));
    for (const cls of classes) for (const subject of subjects) {
      const teacher = subject.name === "Mathematics" ? users["subject.teacher"] : users["class.teacher"];
      await tx.classSubjectTeacher.upsert({ where: { classId_subjectId_teacherId: { classId: cls.id, subjectId: subject.id, teacherId: teacher.id } }, update: { schoolId }, create: { schoolId, classId: cls.id, subjectId: subject.id, teacherId: teacher.id } });
    }

    const students = [];
    const guardians = [];
    const studentsByClass = new Map();
    for (let i = 0; i < 9; i++) studentsByClass.set(classes[i].id, []);
    for (let i = 0; i < 75 * 3; i++) {
      const cls = classes[i % classes.length];
      const studentNo = `SNT-${String(i + 1).padStart(4, "0")}`;
      const firstNames = ["Kwesi","Ama","Kojo","Abena","Yaw","Akua","Kofi","Esi","Mavis","Daniel","Naa","Fiifi","Adjoa","Sena","Elikem"];
      const lastNames = ["Mensah","Owusu","Boateng","Asare","Addo","Tetteh","Ofori","Sarpong","Badu","Marfo"];
      const name = `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length) % lastNames.length]}`;
      const student = await tx.student.upsert({ where: { schoolId_admissionNo: { schoolId, admissionNo: studentNo } }, update: { name, dob: d(`${2010 + (i % 5)}-${String((i % 12) + 1).padStart(2,"0")}-${String((i % 27) + 1).padStart(2,"0")}`), classId: cls.id, houseId: houses[i % houses.length].id, status: "active", photoUrl: "https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg" }, create: { schoolId, admissionNo: studentNo, name, dob: d(`${2010 + (i % 5)}-${String((i % 12) + 1).padStart(2,"0")}-${String((i % 27) + 1).padStart(2,"0")}`), classId: cls.id, houseId: houses[i % houses.length].id, status: "active", photoUrl: "https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg" } });
      students.push(student); studentsByClass.get(cls.id).push(student);
    }

    // 50 guardians; every 10th guardian has two siblings to exercise family navigation.
    for (let i = 0; i < 50; i++) {
      const g = await tx.guardian.upsert({ where: { schoolId_phone: { schoolId, phone: phone(100 + i) } }, update: { name: `Guardian ${i + 1}`, email: email(`guardian${i + 1}`) }, create: { schoolId, name: `Guardian ${i + 1}`, phone: phone(100 + i), email: email(`guardian${i + 1}`) } });
      const gu = await tx.user.upsert({ where: { schoolId_email: { schoolId, email: email(`guardian${i + 1}`) } }, update: { name: g.name, passwordHash: passwordsHash, phone: g.phone, status: "active", needsPasswordChange: false }, create: { schoolId, name: g.name, email: g.email, phone: g.phone, passwordHash: passwordsHash, status: "active", needsPasswordChange: false } });
      await tx.userRole.upsert({ where: { userId_roleId: { userId: gu.id, roleId: roleIds.get("Parent") } }, update: { schoolId }, create: { schoolId, userId: gu.id, roleId: roleIds.get("Parent") } });
      await tx.guardian.update({ where: { id: g.id }, data: { userId: gu.id } });
      const childIndexes = i % 10 === 0 ? [i, (i + 50) % students.length] : [i];
      for (const idx of childIndexes) await tx.studentGuardian.upsert({ where: { studentId_guardianId: { studentId: students[idx].id, guardianId: g.id } }, update: { relationship: "Parent", isPrimary: idx === childIndexes[0] }, create: { schoolId, studentId: students[idx].id, guardianId: g.id, relationship: "Parent", isPrimary: idx === childIndexes[0] } });
      credentials.push({ type: "guardian", role: "Parent", name: g.name, email: gu.email, password: PASSWORD, schoolCode: TEST_CODE, linkedStudents: childIndexes.map(idx => students[idx].admissionNo) });
      guardians.push(g);
    }

    // Attendance over a realistic rolling history plus an explicit review conflict.
    for (let day = 0; day < 30; day++) {
      const date = new Date(now); date.setUTCDate(date.getUTCDate() - day); if ([0,6].includes(date.getUTCDay())) continue;
      const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      for (const student of students) {
        const mode = (student.id.charCodeAt(0) + day) % 10;
        const type = mode === 9 ? "out" : "in";
        await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT ("id") DO NOTHING`, uid(), schoolId, student.id, type, mode === 0 ? "qr" : "manual", date, dateOnly, mode === 8, users["class.teacher"].id);
      }
    }
    const conflictStudent = students[0];
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'in','device',$4,$5,false,$6)`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users["transport"].id);
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'out','manual',$4,$5,false,$6)`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users["frontdesk"].id);

    // Assessments and scores for each term; one deliberately high-subject-count student gets all eight subjects.
    const assessments = [];
    for (const term of [termMap["Term 1"], termMap["Term 2"], termMap["Term 3"]]) for (const cls of classes) for (const subj of subjects) {
      const a = await tx.assessment.upsert({ where: { schoolId_termId_classId_subjectId_name: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "Continuous Assessment" } }, update: {}, create: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "Continuous Assessment", type: "CA", weight: new Prisma.Decimal(40), maxScore: new Prisma.Decimal(100) } });
      const e = await tx.assessment.upsert({ where: { schoolId_termId_classId_subjectId_name: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "End of Term Examination" } }, update: {}, create: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "End of Term Examination", type: "EXAM", weight: new Prisma.Decimal(60), maxScore: new Prisma.Decimal(100) } });
      assessments.push([a, e, cls, subj, term]);
    }
    for (const [a, e, cls, subj, term] of assessments) {
      const classStudents = studentsByClass.get(cls.id) || [];
      for (let idx = 0; idx < classStudents.length; idx++) {
        const base = 45 + ((idx + subj.name.length + term.name.length) % 45);
        await tx.score.upsert({ where: { studentId_assessmentId: { studentId: classStudents[idx].id, assessmentId: a.id } }, update: { value: new Prisma.Decimal(base), enteredBy: users["subject.teacher"].id }, create: { schoolId, studentId: classStudents[idx].id, subjectId: subj.id, assessmentId: a.id, value: new Prisma.Decimal(base), enteredBy: users["subject.teacher"].id } });
        await tx.score.upsert({ where: { studentId_assessmentId: { studentId: classStudents[idx].id, assessmentId: e.id } }, update: { value: new Prisma.Decimal(Math.max(0, base - 5)), enteredBy: users["subject.teacher"].id }, create: { schoolId, studentId: classStudents[idx].id, subjectId: subj.id, assessmentId: e.id, value: new Prisma.Decimal(Math.max(0, base - 5)), enteredBy: users["subject.teacher"].id } });
      }
    }
    const highLoad = students[0];
    await tx.reportCard.create({ data: { schoolId, studentId: highLoad.id, termId: termMap["Term 2"].id, status: "approved", approvedBy: users.principal.id, approvedAt: d("2026-04-01"), calculationSnapshot: { calculationVersion: 1, subjects: subjects.map(s => s.name) }, calculationVersion: 1, remarks: "Consistent effort across a broad subject load." } }).catch(() => {});

    // Fees, invoices, partial payment and reversal scenario.
    const feeItems = [];
    for (const term of [termMap["Term 1"], termMap["Term 2"], termMap["Term 3"]]) for (const [name, amount] of [["Tuition", 1800],["ICT Levy", 180],["Activities", 120]]) feeItems.push(await tx.feeItem.upsert({ where: { schoolId_termId_classId_name: { schoolId, termId: term.id, classId: null, name } }, update: { amount: new Prisma.Decimal(amount) }, create: { schoolId, termId: term.id, classId: null, name, amount: new Prisma.Decimal(amount) } }));
    for (const term of [termMap["Term 1"], termMap["Term 2"], termMap["Term 3"]]) for (const student of students) {
      const lines = feeItems.filter(f => f.termId === term.id);
      const total = lines.reduce((n,f)=>n+Number(f.amount),0);
      const invoice = await tx.invoice.upsert({ where: { studentId_termId: { studentId: student.id, termId: term.id } }, update: { totalAmount: new Prisma.Decimal(total) }, create: { schoolId, studentId: student.id, termId: term.id, totalAmount: new Prisma.Decimal(total), status: "unpaid" } });
      for (const line of lines) await tx.invoiceLine.upsert({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: line.id } }, update: { amount: line.amount, schoolId }, create: { schoolId, invoiceId: invoice.id, feeItemId: line.id, amount: line.amount } });
      if (student.id === students[1].id && term.name === "Term 1") {
        const payment = await tx.payment.create({ data: { schoolId, invoiceId: invoice.id, amount: new Prisma.Decimal(1000), method: "bank_transfer", reference: `TEST-PARTIAL-${TEST_CODE}`, createdAt: d("2026-01-15") } });
        await tx.paymentReversal.create({ data: { schoolId, paymentId: payment.id, amount: new Prisma.Decimal(250), reason: "Test reversal of an incorrectly allocated portion", reversedBy: users.accountant.id, createdAt: d("2026-01-16") } });
      }
    }

    // Timetable with a substitute assignment.
    for (let i = 0; i < classes.length; i++) for (let day = 1; day <= 5; day++) {
      const subject = subjects[(i + day) % subjects.length]; const teacher = subject.name === "Mathematics" ? users["subject.teacher"] : users["class.teacher"];
      await tx.timetableSlot.upsert({ where: { schoolId_classId_dayOfWeek_period: { schoolId, classId: classes[i].id, dayOfWeek: day, period: 1 } }, update: { subjectId: subject.id, teacherId: teacher.id }, create: { schoolId, classId: classes[i].id, subjectId: subject.id, teacherId: teacher.id, dayOfWeek: day, period: 1 } });
    }
    const slot = await tx.timetableSlot.findFirst({ where: { schoolId, classId: classes[0].id } });
    if (slot) await tx.substituteAssignment.upsert({ where: { schoolId_timetableSlotId_assignmentDate: { schoolId, timetableSlotId: slot.id, assignmentDate: d("2026-09-14") } }, update: { substituteTeacherId: users["subject.teacher"].id }, create: { schoolId, timetableSlotId: slot.id, substituteTeacherId: users["subject.teacher"].id, assignedBy: users.principal.id, assignmentDate: d("2026-09-14") } });

    // Transport, feeding, CBT, library, assets, recruitment and offline-sync tables.
    const v1 = uid(), v2 = uid(), r1 = uid(), r2 = uid(), stopIds = [uid(),uid(),uid(),uid()];
    await exec(tx, `INSERT INTO "P3Vehicle" ("id","schoolId","registrationNumber","name","capacity","status","driverName","driverPhone") VALUES ($1,$2,'GT-TEST-001','Kantamanto Shuttle',32,'active','Kwabena Asiedu','+233241111111'),($3,$2,'GT-TEST-002','Adenta Route Bus',45,'active','Joseph Laryea','+233242222222') ON CONFLICT DO NOTHING`, v1, schoolId, v2);
    await exec(tx, `INSERT INTO "P3BusRoute" ("id","schoolId","name","code","origin","destination","status") VALUES ($1,$2,'North Residential Loop','NRL','East Legon','SukuuNova Academy','active'),($3,$2,'South Residential Loop','SRL','Adenta','SukuuNova Academy','active') ON CONFLICT DO NOTHING`, r1, schoolId, r2);
    for (let i=0;i<4;i++) await exec(tx, `INSERT INTO "P3BusStop" ("id","schoolId","name","latitude","longitude") VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, stopIds[i], schoolId, ["East Legon Hills","American House","Ashaley Botwe","Adenta Barrier"][i], 5.62+i/100, -0.17-i/100);
    for (let i=0;i<4;i++) await exec(tx, `INSERT INTO "P3RouteStop" ("id","schoolId","routeId","stopId","sequence","etaMinutes") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, uid(), schoolId, i<2?r1:r2, stopIds[i], (i%2)+1, 10+(i*4));
    await exec(tx, `INSERT INTO "P3VehicleLocation" ("id","schoolId","vehicleId","routeId","latitude","longitude","speedKph","heading","source") VALUES ($1,$2,$3,$4,5.631,-0.171,28,90,'gps'),($5,$2,$6,$7,5.641,-0.161,22,180,'gps') ON CONFLICT DO NOTHING`, uid(), schoolId, v1, r1, uid(), v2, r2);
    await exec(tx, `INSERT INTO "P3ParentLocation" ("id","schoolId","guardianId","routeId","latitude","longitude") VALUES ($1,$2,$3,$4,5.65,-0.15) ON CONFLICT ("schoolId","guardianId") DO UPDATE SET "routeId"=EXCLUDED."routeId"`, uid(), schoolId, guardians[0].id, r1);
    await exec(tx, `INSERT INTO "P3BoardingEvent" ("id","schoolId","vehicleId","routeId","studentId","type","stopId","createdBy") VALUES ($1,$2,$3,$4,$5,'boarded',$6,$7),($8,$2,$3,$4,$9,'alighted',$10,$7) ON CONFLICT DO NOTHING`, uid(),schoolId,v1,r1,students[0].id,stopIds[0],users.transport.id,uid(),students[1].id,stopIds[1]);
    await exec(tx, `INSERT INTO "P3VehicleComplianceReminder" ("id","schoolId","vehicleId","kind","dueAt","notes","createdBy") VALUES ($1,$2,$3,'roadworthiness',$4,'Quarterly test fixture reminder',$5) ON CONFLICT DO NOTHING`, uid(), schoolId, v1, d("2026-09-20"), users.transport.id);

    await exec(tx, `INSERT INTO "P3FeedingBudget" ("id","schoolId","name","periodStart","periodEnd","plannedAmount","createdBy") VALUES ($1,$2,'Term 3 Feeding Budget',$3,$4,24500,$5),($6,$2,'September Supplement',$7,$8,6200,$5) ON CONFLICT DO NOTHING`, uid(),schoolId,d("2026-04-20"),d("2026-07-24"),users.accountant.id,uid(),d("2026-09-01"),d("2026-09-30"),users.accountant.id);
    const menu = uid(); await exec(tx, `INSERT INTO "P3FeedingMenu" ("id","schoolId","menuDate","meal","items","plannedCost","createdBy") VALUES ($1,$2,$3,'Lunch',$4,520,$5) ON CONFLICT DO NOTHING`, menu, schoolId, d("2026-09-01"), JSON.stringify(["Waakye","Gari","Salad","Fruit"]), users.accountant.id);
    await exec(tx, `INSERT INTO "P3FeedingLog" ("id","schoolId","menuId","logDate","meal","servedCount","actualCost","notes","createdBy") VALUES ($1,$2,$3,$4,'Lunch',214,548,'Slightly higher attendance than planned',$5) ON CONFLICT DO NOTHING`, uid(),schoolId,menu,d("2026-09-01"),users.accountant.id);
    await exec(tx, `INSERT INTO "P3FeedingInvoiceItem" ("id","schoolId","invoiceId","description","amount","status","createdBy") VALUES ($1,$2,$3,'Special dietary meal support',45,'optional',$4) ON CONFLICT DO NOTHING`, uid(),schoolId,(await tx.invoice.findFirst({where:{schoolId}})).id,users.accountant.id);

    const exam = uid(); await exec(tx, `INSERT INTO "P3Exam" ("id","schoolId","title","description","durationSeconds","opensAt","closesAt","status","createdBy") VALUES ($1,$2,'JHS 2 Mathematics Practice','Synthetic CBT practice examination',3600,$3,$4,'published',$5) ON CONFLICT DO NOTHING`, exam,schoolId,new Date(now.getTime()-3600000),new Date(now.getTime()+86400000),users["subject.teacher"].id);
    for(let q=0;q<5;q++) await exec(tx, `INSERT INTO "P3ExamQuestion" ("id","schoolId","examId","prompt","options","correctOptionIndex","points","orderIndex") VALUES ($1,$2,$3,$4,$5,1,5,$6) ON CONFLICT DO NOTHING`,uid(),schoolId,exam,`Practice question ${q+1}: choose the correct answer.`,JSON.stringify(["10","20","30","40"]),q+1);
    await exec(tx, `INSERT INTO "P3ExamAttempt" ("id","schoolId","examId","studentId","startedAt","expiresAt","submittedAt","status","score","answers") VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',22.5,$8) ON CONFLICT DO NOTHING`,uid(),schoolId,exam,students[2].id,new Date(now.getTime()-7200000),new Date(now.getTime()-3600000),new Date(now.getTime()-1800000),JSON.stringify({"1":1,"2":2}));

    for(let i=0;i<20;i++) await exec(tx, `INSERT INTO "P3LibraryBook" ("id","schoolId","isbn","title","author","category","copies","availableCopies") VALUES ($1,$2,$3,$4,$5,$6,3,2) ON CONFLICT DO NOTHING`,uid(),schoolId,`978-0-TEST-${String(i).padStart(5,"0")}`,`SukuuNova Library Book ${i+1}`,`Author ${i+1}`,i%2?"Literature":"STEM");
    const book = (await tx.$queryRawUnsafe(`SELECT "id" FROM "P3LibraryBook" WHERE "schoolId"=$1 ORDER BY "title" LIMIT 1`, schoolId))[0];
    if(book) await exec(tx, `INSERT INTO "P3LibraryLoan" ("id","schoolId","bookId","studentId","borrowedAt","dueAt","status","issuedBy") VALUES ($1,$2,$3,$4,$5,$6,'borrowed',$7) ON CONFLICT DO NOTHING`,uid(),schoolId,book.id,students[3].id,new Date(now.getTime()-14*86400000),new Date(now.getTime()-2*86400000),users["frontdesk"].id);

    for(let i=0;i<25;i++) await exec(tx, `INSERT INTO "P3Asset" ("id","schoolId","assetTag","name","category","serialNumber","location","condition","status","purchaseDate","purchaseCost","assignedToUserId","notes") VALUES ($1,$2,$3,$4,$5,$6,$7,'good','active',$8,$9,$10,$11) ON CONFLICT DO NOTHING`,uid(),schoolId,`AST-${String(i+1).padStart(4,"0")}`,`Asset ${i+1}`,i%2?"ICT":"Furniture",`SN-TEST-${i+1}`,i%3?"Block B":"Main Office",d("2025-09-01"),new Prisma.Decimal(450+i*20),i%2?users["class.teacher"].id:null,"Synthetic test asset");

    const posting = uid(); await exec(tx, `INSERT INTO "P3RecruitmentPosting" ("id","schoolId","title","department","employmentType","description","status","closingDate","createdBy") VALUES ($1,$2,'Senior Mathematics Teacher','Academics','Full-time','Teach JHS mathematics and support assessment moderation.','open',$3,$4) ON CONFLICT DO NOTHING`,posting,schoolId,d("2026-10-15"),users.hr.id);
    for(let i=0;i<5;i++) await exec(tx, `INSERT INTO "P3Applicant" ("id","schoolId","postingId","name","email","phone","resumeUrl","status","notes") VALUES ($1,$2,$3,$4,$5,$6,'https://example.test/resume.pdf',$7,$8) ON CONFLICT DO NOTHING`,uid(),schoolId,posting,`Applicant ${i+1}`,email(`applicant${i+1}`),phone(500+i),i===0?"shortlisted":"applied",i===0?"Strong subject background":"Synthetic applicant record");

    for(let i=0;i<8;i++) await exec(tx, `INSERT INTO "P3FinanceAdjustment" ("id","schoolId","studentId","invoiceId","kind","mode","value","reason","status","requestedBy","approvedBy","approvedAt") VALUES ($1,$2,$3,$4,'sibling_discount','percent',10,'Synthetic sibling discount test','approved',$5,$6,$7) ON CONFLICT DO NOTHING`,uid(),schoolId,students[i].id,(await tx.invoice.findFirst({where:{schoolId,studentId:students[i].id}}))?.id,'x',users.accountant.id,users.principal.id,d("2026-01-20"));
    for(let i=0;i<5;i++) await exec(tx, `INSERT INTO "P3OfflineSyncQueue" ("id","schoolId","clientGeneratedId","entityType","payload","status","entityId","createdAt") VALUES ($1,$2,$3,'attendance',$4,'pending',$5,$6) ON CONFLICT DO NOTHING`,uid(),schoolId,`test-offline-${i+1}`,JSON.stringify({studentId:students[i].id,status:i%2?"ABSENT":"PRESENT"}),students[i].id,new Date(now.getTime()-i*3600000));

    // Internal messages deliberately stay in-app/email; no SMS/WhatsApp provider is invoked.
    const messageBodies = ["Attendance was not submitted for one class today.","A report card is ready for review.","Your fee payment has been recorded.","Please review the pending pickup request."];
    for(let i=0;i<messageBodies.length;i++) await tx.message.upsert({ where: { schoolId_idempotencyKey: { schoolId, idempotencyKey: `test-message-${i+1}` } }, update: { body: messageBodies[i] }, create: { schoolId, channel: "in_app", recipientType: "guardian", recipientId: guardians[i].id, recipientPhone: guardians[i].phone, body: messageBodies[i], status: "queued", idempotencyKey: `test-message-${i+1}` } });

    // Payroll and staff presence.
    for (const key of ["principal","accountant","class.teacher","subject.teacher","hr"]) await tx.salaryStructure.upsert({ where: { schoolId_staffId: { schoolId, staffId: users[key].id } }, update: { grossSalary: new Prisma.Decimal(5000), deductions: { ssnit: 300, tax: 450 } }, create: { schoolId, staffId: users[key].id, grossSalary: new Prisma.Decimal(5000), deductions: { ssnit: 300, tax: 450 } } });
    const payroll = await tx.payrollRun.upsert({ where: { schoolId_period: { schoolId, period: "2026-08" } }, update: { status: "processed", processedAt: d("2026-08-31") }, create: { schoolId, period: "2026-08", status: "processed", processedAt: d("2026-08-31") } });
    for (const key of ["principal","accountant","class.teacher","subject.teacher","hr"]) await tx.payslip.upsert({ where: { schoolId_payrollRunId_staffId: { schoolId, payrollRunId: payroll.id, staffId: users[key].id } }, update: {}, create: { schoolId, payrollRunId: payroll.id, staffId: users[key].id, gross: new Prisma.Decimal(5000), deductions: { ssnit: 300, tax: 450 }, net: new Prisma.Decimal(4250) } });
    for (const [n,key] of [[0,"frontdesk"],[1,"transport"],[2,"hr"]]) await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","staffId","type","method","timestamp","attendanceDate","recordedBy") VALUES ($1,$2,$3,'in','manual',$4,$5,$6)`,uid(),schoolId,users[key].id,new Date(now.getTime()-n*3600000),d("2026-09-01"),users.frontdesk.id);

    // Visitors and pickup workflow.
    for(let i=0;i<6;i++) await tx.visitorLog.create({ data: { schoolId, name: `Visitor ${i+1}`, phone: phone(800+i), purpose: i%2 ? "Parent meeting" : "Supplier visit", hostStaffId: users.principal.id, timeIn: new Date(now.getTime()-i*3600000), timeOut: i%2 ? new Date(now.getTime()-(i*3600000)-1800000) : null } });
    const approved = await tx.approvedPickup.upsert({ where: { schoolId_studentId_guardianId: { schoolId, studentId: students[0].id, guardianId: guardians[0].id } }, update: {}, create: { schoolId, studentId: students[0].id, guardianId: guardians[0].id } });
    await tx.pickupApprovalRequest.create({ data: { schoolId, studentId: students[0].id, collectedByGuardianId: guardians[0].id, requestedByUserId: users["frontdesk"].id, status: "approved", approvedByUserId: users.principal.id, reviewedAt: now } }).catch(()=>{});
    await tx.pickupEvent.create({ data: { schoolId, studentId: students[0].id, collectedByGuardianId: guardians[0].id, wasPreApproved: true, approvedByUserId: users.principal.id, timestamp: now } });

    await tx.auditLogSchool.create({ data: { schoolId, actorId: owner.id, action: "test_fixture.created", entityType: "School", entityId: schoolId, after: { students: students.length, guardians: guardians.length, classes: classes.length, subjects: subjects.length, terms: 3, premiumModules: true } } });
    audit.push({ students: students.length, guardians: guardians.length, classes: classes.length, subjects: subjects.length });
  });

  const platformEmail = process.env.TEST_PLATFORM_ADMIN_EMAIL || `platform.admin.${TEST_CODE}@test.sukuunova.local`;
  const platform = await prisma.platformAdmin.upsert({ where: { email: platformEmail }, update: { name: "SukuuNova Test Platform Admin", passwordHash: passwordsHash, status: "active", role: "super_admin" }, create: { name: "SukuuNova Test Platform Admin", email: platformEmail, passwordHash: passwordsHash, status: "active", role: "super_admin" } });
  credentials.unshift({ type: "platform", role: "super_admin", name: platform.name, email: platform.email, password: PASSWORD });

  const report = {
    generatedAt: new Date().toISOString(),
    database: "TEST_DATABASE_URL only (isolated from DATABASE_URL)",
    school: { name: TEST_SCHOOL_NAME, code: TEST_CODE, id: schoolId },
    accounts: credentials,
    summary: audit[0],
    integrations: { sms: "not invoked", whatsapp: "not invoked", face: "not enrolled", fingerprint: "not enrolled" },
    assetImage: "https://raw.githubusercontent.com/Eugene999B/SukuuNova/main/icon.svg"
  };
  fs.mkdirSync(path.resolve("test-artifacts"), { recursive: true });
  fs.writeFileSync(path.resolve("test-artifacts/realistic-test-school-credentials.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
