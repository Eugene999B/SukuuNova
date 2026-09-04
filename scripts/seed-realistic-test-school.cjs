#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { hash } = require("bcryptjs");
const { Decimal } = require("decimal.js");
const prisma = new PrismaClient();

const TEST_CODE = String(process.env.TEST_SCHOOL_CODE || "sn-realistic").trim();
const TEST_NAME = String(process.env.TEST_SCHOOL_NAME || "SukuuNova Academy").trim();
const PASSWORD = String(process.env.TEST_SEED_PASSWORD || "RealisticSeed!2026");
const DATABASE_URL = String(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required.");
if (PASSWORD.length < 12) throw new Error("TEST_SEED_PASSWORD must be at least 12 characters.");

function uid() { return randomUUID().replaceAll("-", "").slice(0, 24); }
function nowDate() { return new Date(); }
function d(value) { return new Date(`${value}T00:00:00.000Z`); }
function money(value) { return new Decimal(String(value)); }
function phone(seed) { return `+23324${String(seed).padStart(7, "0")}`; }
function email(slug) { return `${slug}.${TEST_CODE}@test.sukuunova.local`; }
async function exec(tx, sql, ...args) { return tx.$executeRawUnsafe(sql, ...args); }

async function main() {
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`SELECT 1`);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.school.findUnique({ where: { uniqueCode: TEST_CODE } });
    if (existing) throw new Error(`Test school ${TEST_CODE} already exists. Refusing duplicate seed.`);

    const plan = await tx.subscriptionPlan.upsert({ where: { code: "foundation" }, update: {}, create: { code: "foundation", name: "Foundation", priceMonthly: money(0), maxStudents: 5000, active: true } });
    const school = await tx.school.create({ data: { name: TEST_NAME, uniqueCode: TEST_CODE, status: "active", subscriptionPlanId: plan.id } });
    const schoolId = school.id;
    await tx.schoolLoginDirectory.create({ data: { schoolId, uniqueCode: TEST_CODE, status: "active" } });
    await tx.schoolSettings.create({ data: { schoolId, schoolName: TEST_NAME, logoUrl: "/branding/eugene-academy.svg", currency: "GHS", country: "Ghana" } }).catch(() => {});

    const permissions = ["schools.view","schools.manage","students.view","students.manage","guardians.view","guardians.manage","academics.view","academics.manage","attendance.view","attendance.manage","fees.view","fees.manage","payroll.view","payroll.manage","transport.view","transport.manage","library.view","library.manage","communications.view","communications.manage","reports.view","reports.manage","settings.view","settings.manage"];
    for (const code of permissions) await tx.permission.upsert({ where: { code }, update: {}, create: { code, name: code } });
    const roleNames = ["Owner","Principal","Accountant","Class Teacher","Subject Teacher","HR Officer","Transport Officer","Front Desk","Parent","Student","Academic Coordinator","Department Head","Admissions Officer"];
    const roleIds = new Map();
    for (const name of roleNames) { const role = await tx.role.create({ data: { schoolId, name } }); roleIds.set(name, role.id); }
    const ownerHash = await hash(PASSWORD, 12);
    const users = {};
    const userSpecs = [
      ["owner","Owner","Eugene Academy Owner"],["principal","Principal","Principal Eugene Academy"],["accountant","Accountant","Finance Accountant"],["class.teacher","Class Teacher","Class Teacher One"],["subject.teacher","Subject Teacher","Subject Teacher One"],["hr","HR Officer","HR Officer One"],["transport","Transport Officer","Transport Officer One"],["frontdesk","Front Desk","Front Desk Officer One"],["academic","Academic Coordinator","Academic Coordinator One"],["department","Department Head","Department Head One"],["admissions","Admissions Officer","Admissions Officer One"]
    ];
    for (const [key, role, name] of userSpecs) {
      const user = await tx.user.create({ data: { schoolId, name, email: email(key === "owner" ? "owner" : key), phone: phone(200 + Object.keys(users).length), passwordHash: ownerHash, status: "active", needsPasswordChange: false } });
      await tx.userRole.create({ data: { schoolId, userId: user.id, roleId: roleIds.get(role) } }); users[key] = user;
    }
    for (const roleName of roleNames) for (const permissionCode of permissions) {
      if (!["Owner","Principal","Accountant","Class Teacher","Subject Teacher","HR Officer","Transport Officer","Front Desk","Parent","Student","Academic Coordinator","Department Head","Admissions Officer"].includes(roleName)) continue;
      const permission = await tx.permission.findUnique({ where: { code: permissionCode } });
      if (permission) await tx.rolePermission.create({ data: { roleId: roleIds.get(roleName), permissionId: permission.id } }).catch(() => {});
    }

    const academicYears = [];
    for (const [name, start, end, active] of [["2024/2025","2024-09-02","2025-07-18",false],["2025/2026","2025-09-01","2026-07-17",false],["2026/2027","2026-09-07","2027-07-16",true]]) {
      academicYears.push(await tx.academicYear.create({ data: { schoolId, name, startDate: d(start), endDate: d(end), active } }));
    }
    const terms = [];
    for (const year of academicYears) for (const [name, start, end] of [["Term 1",`${year.name.slice(0,4)}-09-02`,`${year.name.slice(0,4)}-12-13`],["Term 2",`${Number(year.name.slice(0,4))+1}-01-06`,`${Number(year.name.slice(0,4))+1}-04-04`],["Term 3",`${Number(year.name.slice(0,4))+1}-04-14`,`${Number(year.name.slice(0,4))+1}-07-16`]]) terms.push(await tx.term.create({ data: { schoolId, academicYearId: year.id, name, startDate: d(start), endDate: d(end), status: name === "Term 3" && year.active ? "active" : "completed" } }));
    const termMap = new Map(terms.filter(t => t.academicYearId === academicYears[2].id).map(t => [t.name, t]));

    const houses = []; for (const name of ["Gold","Blue","Green","Red"]) houses.push(await tx.house.create({ data: { schoolId, name, color: name } }));
    const classes = []; for (const name of ["JHS 1A","JHS 1B","JHS 1C","JHS 2A","JHS 2B","JHS 2C","JHS 3A","JHS 3B","JHS 3C"]) classes.push(await tx.class.create({ data: { schoolId, name, level: name.slice(0,5), stream: name.slice(-1), academicYearId: academicYears[2].id } }));
    const subjects = []; for (const name of ["Mathematics","English Language","Integrated Science","Social Studies","ICT","French","Creative Arts","Physical Education"]) subjects.push(await tx.subject.create({ data: { schoolId, name, code: name.slice(0,3).toUpperCase() } }));
    for (const cls of classes) for (const subj of subjects) await tx.subjectAssignment.create({ data: { schoolId, classId: cls.id, subjectId: subj.id, teacherId: users["subject.teacher"].id } }).catch(() => {});

    const students = []; const studentsByClass = new Map(classes.map(c => [c.id, []]));
    for (let i = 0; i < 225; i++) {
      const cls = classes[i % classes.length]; const student = await tx.student.create({ data: { schoolId, admissionNo: `EUG${String(i + 1).padStart(4, "0")}`, name: `Student ${i + 1}`, gender: i % 2 ? "F" : "M", classId: cls.id, houseId: houses[i % houses.length].id, dateOfBirth: d(`${2011 + (i % 4)}-02-10`) } });
      students.push(student); studentsByClass.get(cls.id).push(student);
    }

    for (let i = 0; i < 50; i++) {
      const g = await tx.guardian.create({ data: { schoolId, name: `Guardian ${i + 1}`, phone: phone(100 + i), email: email(`guardian${i + 1}`) } });
      const gu = await tx.user.create({ data: { schoolId, name: g.name, email: email(`guardian${i + 1}`), phone: g.phone, passwordHash: ownerHash, status: "active", needsPasswordChange: false } });
      await tx.userRole.create({ data: { schoolId, userId: gu.id, roleId: roleIds.get("Parent") } });
      await tx.guardian.update({ where: { id: g.id }, data: { userId: gu.id } });
      const childIndexes = i % 10 === 0 ? [i, (i + 50) % students.length] : [i];
      for (const idx of childIndexes) await tx.studentGuardian.create({ data: { schoolId, studentId: students[idx].id, guardianId: g.id, relationship: "Parent", isPrimary: idx === childIndexes[0] } });
    }

    // Attendance over a realistic rolling history. Methods must match the
    // database CHECK constraint: qr or manual. A device-originated conflict
    // is represented as QR because device is the event source, not method.
    for (let day = 0; day < 30; day++) {
      const date = new Date(); date.setUTCDate(date.getUTCDate() - day); if ([0,6].includes(date.getUTCDay())) continue;
      const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      for (const student of students) {
        const mode = (student.id.charCodeAt(0) + day) % 10; const type = mode === 9 ? "out" : "in";
        await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT ("id") DO NOTHING`, uid(), schoolId, student.id, type, mode === 0 ? "qr" : "manual", date, dateOnly, mode === 8, users["class.teacher"].id);
      }
    }
    const conflictStudent = students[0];
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'in','qr',$4,$5,false,$6)`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users.transport.id);
    await exec(tx, `INSERT INTO "AttendanceEvent" ("id","schoolId","studentId","type","method","timestamp","attendanceDate","isLate","recordedBy") VALUES ($1,$2,$3,'out','manual',$4,$5,false,$6)`, uid(), schoolId, conflictStudent.id, d("2026-08-31"), d("2026-08-31"), users.frontdesk.id);

    const assessments = []; for (const term of [termMap.get("Term 1"), termMap.get("Term 2"), termMap.get("Term 3")]) for (const cls of classes) for (const subj of subjects) {
      const a = await tx.assessment.create({ data: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "Continuous Assessment", type: "CA", weight: money(40), maxScore: money(100) } });
      const e = await tx.assessment.create({ data: { schoolId, termId: term.id, classId: cls.id, subjectId: subj.id, name: "End of Term Examination", type: "EXAM", weight: money(60), maxScore: money(100) } }); assessments.push([a,e,cls,subj,term]);
    }
    for (const [a,e,cls,subj] of assessments) { const classStudents = studentsByClass.get(cls.id) || []; for (let idx=0; idx<classStudents.length; idx++) { const base=45+((idx+subj.name.length)%45); await tx.score.create({ data:{ schoolId, studentId:classStudents[idx].id, subjectId:subj.id, assessmentId:a.id, value:money(base), enteredBy:users["subject.teacher"].id } }); await tx.score.create({ data:{ schoolId, studentId:classStudents[idx].id, subjectId:subj.id, assessmentId:e.id, value:money(Math.max(0,base-5)), enteredBy:users["subject.teacher"].id } }); } }

    // Timetable: 5 weekdays x 5 periods across the first classes.
    for (let day = 1; day <= 5; day++) for (let p = 1; p <= 5; p++) for (let ci=0; ci<3; ci++) { const cls=classes[ci]; const subj=subjects[(day+p+ci)%subjects.length]; await tx.timetableSlot.create({ data:{ schoolId, classId:cls.id, subjectId:subj.id, teacherId:users["subject.teacher"].id, termId:termMap.get("Term 3").id, dayOfWeek:day, period:p, room:`Room ${100+ci}` } }).catch(()=>{}); }

    // Finance baseline.
    for (const term of [termMap.get("Term 1"),termMap.get("Term 2"),termMap.get("Term 3")]) for (const [name,amount] of [["Tuition",1800],["ICT Levy",180],["Activities",120]]) await tx.feeItem.create({ data:{ schoolId, termId:term.id, classId:null, name, amount:money(amount) } });

    // Library / transport / feeding / assets / recruitment / communications are
    // deliberately represented with compact synthetic records in the P3 tables.
    for (let i=0;i<20;i++) await exec(tx, `INSERT INTO "P3LibraryBook" ("id","schoolId","title","author","isbn","category","copies","availableCopies","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,NOW(),NOW()) ON CONFLICT ("id") DO NOTHING`, uid(),schoolId,`Eugene Academy Library ${i+1}`,`Author ${i+1}`,`EUG-${String(i+1).padStart(5,'0')}`,i%2?"Literature":"Textbook",3);
    for (let i=0;i<12;i++) await exec(tx, `INSERT INTO "P3Asset" ("id","schoolId","name","category","serialNumber","condition","quantity","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT ("id") DO NOTHING`, uid(),schoolId,`Asset ${i+1}`,i%2?"Furniture":"ICT",`EUG-ASSET-${i+1}`,"good",i+1);
    for (let i=0;i<3;i++) await exec(tx, `INSERT INTO "P3Vehicle" ("id","schoolId","registrationNo","capacity","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("id") DO NOTHING`, uid(),schoolId,`GR-${String(5000+i)}` ,30+i*5,"active");

    return { schoolId, school, summary:{students:students.length, guardians:50, staff:Object.keys(users).length, roles:roleNames.length, classes:classes.length, houses:houses.length, academicYears:academicYears.length, terms:terms.length, subjects:subjects.length, timetable:"seeded", attendance:"30-day history", fees:"baseline configured", libraryBooks:20, assets:12, vehicles:3} };
  });
  console.log(JSON.stringify({ generatedAt:nowDate().toISOString(), school:result.school, summary:result.summary }));
}
main().catch(err=>{ console.error(err); process.exitCode=1; }).finally(async()=>prisma.$disconnect());
