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
    const roleIds = new Map();
    for (const [name, slug] of roles) {
      const role = await tx.role.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name, description: `${name} role` } });
      roleIds.set(name, role.id);
      permissions.set(name, rolePermissions[name] || []);
    }
    const roleDefinitions = Object.entries(rolePermissions);
    for (const [roleName, perms] of roleDefinitions) {
      const roleId = roleIds.get(roleName);
      for (const perm of perms) {
        const existing = await tx.permission.findUnique({ where: { key: perm } });
        const permission = existing || await tx.permission.create({ data: { key: perm, description: perm } });
        await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: permission.id } }, update: {}, create: { roleId, permissionId: permission.id } });
      }
    }

    const termRows = [
      ["Term 1", "2025-09-01", "2025-12-19"],
      ["Term 2", "2026-01-05", "2026-04-10"],
      ["Term 3", "2026-04-20", "2026-07-31"]
    ];
    const termMap = new Map();
    for (const [name, startDate, endDate] of termRows) {
      const term = await tx.term.upsert({ where: { schoolId_name: { schoolId, name } }, update: { startDate: d(startDate), endDate: d(endDate), status: name === "Term 3" ? "ACTIVE" : "COMPLETED" }, create: { schoolId, name, startDate: d(startDate), endDate: d(endDate), status: name === "Term 3" ? "ACTIVE" : "COMPLETED" } });
      termMap.set(name, term);
    }
    const academicYear = await tx.academicYear.upsert({ where: { schoolId_name: { schoolId, name: "2025/2026" } }, update: {}, create: { schoolId, name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-07-31"), status: "ACTIVE" } });

    const houses = [];
    for (const name of ["Adom House","Nkrumah House","Asante House","Anloga House"]) houses.push(await tx.house.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name, color: name.includes("Adom") ? "#2563eb" : name.includes("Nkrumah") ? "#059669" : name.includes("Asante") ? "#f59e0b" : "#dc2626" } }));

    const classes = [];
    for (const name of ["JHS 1 A","JHS 1 B","JHS 2 A","JHS 2 B","JHS 3 A","JHS 3 B","Primary 5","Primary 6","Creche"]) classes.push(await tx.class.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name, level: name.startsWith("JHS") ? "JHS" : name.startsWith("Primary") ? "PRIMARY" : "EARLY_YEARS" } }));

    const subjects = [];
    for (const name of ["Mathematics","English Language","Integrated Science","Social Studies","ICT","French","Creative Arts","Religious and Moral Education"]) subjects.push(await tx.subject.upsert({ where: { schoolId_name: { schoolId, name } }, update: {}, create: { schoolId, name, code: name.slice(0,3).toUpperCase() } }));

    const users = {};
    for (const [name, slug, roleName] of [["Ama Mensah","owner","Owner"],["Kofi Boateng","principal","Principal"],["Linda Owusu","accountant","Accountant"],["Yaw Asare","class.teacher","Class Teacher"],["Esi Tetteh","subject.teacher","Subject Teacher"],["Mavis Marfo","hr","HR Officer"],["Daniel Badu","transport","Transport Officer"],["Naa Addo","frontdesk","Front Desk/Gate Security"],["Sena Ofori","academic","Academic Coordinator"]]) {
      const u = await tx.user.upsert({ where: { schoolId_email: { schoolId, email: email(slug) } }, update: { name, passwordHash: passwordsHash, status: "active", needsPasswordChange: false }, create: { schoolId, name, email: email(slug), phone: phone(50 + Object.keys(users).length), passwordHash: passwordsHash, status: "active", needsPasswordChange: false } });
      users[slug] = u;
      await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: roleIds.get(roleName) } }, update: { schoolId }, create: { schoolId, userId: u.id, roleId: roleIds.get(roleName) } });
    }

    const students = [];
    const studentsByClass = new Map(classes.map((c) => [c.id, []]));
    for (let i = 0; i < 90; i++) {
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
    }

    // Attendance over a realistic rolling history plus an explicit review conflict.
    for (let day = 0; day < 30; day++) {
      const date = new Date(now); date.setUTCDate(date.getUTCDate() - day); if ([0,6].includes(date.getUTCDay())) continue;
      const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      for (const student of students) {
        const mode = (student.id.charCodeAt(0) + day) % 10;
        const type = mode === 9 ? "out" : "in";
        await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, uid(), schoolId, student.id, type, mode === 0 ? "qr" : "manual", date, dateOnly, mode === 8, users["class.teacher"].id);
      }
    }
    const conflictStudent = students[0];
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'in','device',$4,$5,false,$6) ON CONFLICT DO NOTHING`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users["transport"].id);
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'out','manual',$4,$5,false,$6) ON CONFLICT DO NOTHING`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users["frontdesk"].id);

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
      const invoice = await tx.invoice.upsert({ where: { schoolId_studentId_termId: { schoolId, studentId: student.id, termId: term.id } }, update: { total: new Prisma.Decimal(2100), balance: new Prisma.Decimal(2100) }, create: { schoolId, studentId: student.id, termId: term.id, invoiceNo: `${TEST_CODE.toUpperCase()}-${term.name.replace(" ","")}-${student.admissionNo}`, total: new Prisma.Decimal(2100), balance: new Prisma.Decimal(2100), status: "issued" } });
      for (const item of feeItems.filter((f) => f.termId === term.id)) await tx.invoiceLine.upsert({ where: { invoiceId_feeItemId: { invoiceId: invoice.id, feeItemId: item.id } }, update: {}, create: { schoolId, invoiceId: invoice.id, feeItemId: item.id, description: item.name, quantity: new Prisma.Decimal(1), unitAmount: item.amount, amount: item.amount } });
    }

    const report = { generatedAt: new Date().toISOString(), school: { id: schoolId, code: TEST_CODE, name: TEST_SCHOOL_NAME }, summary: { students: students.length, classes: classes.length, subjects: subjects.length, guardians: 50, terms: 3, invoices: students.length * 3 } };
    fs.writeFileSync(path.join(__dirname, ".realistic-test-school-output.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ generatedAt: report.generatedAt, school: report.school, summary: report.summary }));
  });
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
