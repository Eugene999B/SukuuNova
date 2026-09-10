#!/usr/bin/env node
/*
 * Eugene Academy full-system staging fixture.
 *
 * Purpose:
 *   Populate a disposable/staging SukuuNova database with a dense, realistic
 *   multi-role school so every major workflow can be exercised safely.
 *
 * Required:
 *   ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES
 *   TEST_DATABASE_URL=<separate staging database>
 *   EUGENE_ACADEMY_TEST_PASSWORD=<12+ char shared trial password>
 *
 * Optional:
 *   EUGENE_ACADEMY_OWNER_NAME=Eugene Academy Owner
 *
 * Safety:
 *   - refuses to run when TEST_DATABASE_URL equals DATABASE_URL;
 *   - never prints the trial password;
 *   - patches the base fixture in a temporary file so the owner is created
 *     directly with the Eugene Academy email and credential reports are redacted;
 *   - keeps every tenant-scoped extension inside an RLS tenant transaction.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const { PrismaClient, Prisma } = require("@prisma/client");
const { hash } = require("bcryptjs");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.EUGENE_ACADEMY_TEST_PASSWORD || "");
const ownerName = String(process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner").trim();

if (allow !== "YES") throw new Error("Refusing seed: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing seed: TEST_DATABASE_URL must be different from DATABASE_URL.");
if (password.length < 12) throw new Error("EUGENE_ACADEMY_TEST_PASSWORD must be at least 12 characters.");

const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const OWNER_EMAIL = "eugeneacademy@gmail.com";
const ARTIFACT_DIR = path.resolve("test-artifacts");
const baseFixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const tempFixturePath = path.join(__dirname, `.eugene-academy-base-${process.pid}.cjs`);

function cleanupTemp() {
  try { fs.unlinkSync(tempFixturePath); } catch {}
}
process.on("exit", cleanupTemp);
process.on("SIGINT", () => { cleanupTemp(); process.exit(130); });
process.on("SIGTERM", () => { cleanupTemp(); process.exit(143); });

function patchAndRunBaseFixture() {
  const original = fs.readFileSync(baseFixturePath, "utf8");
  let patched = original;

  const emailNeedle = 'function email(slug) { return `${slug}.${TEST_CODE}@test.sukuunova.local`; }';
  const emailReplacement = 'function email(slug) { return slug === "owner" ? process.env.EUGENE_ACADEMY_OWNER_EMAIL : `${slug}.${TEST_CODE}@test.sukuunova.local`; }';
  if (!patched.includes(emailNeedle)) throw new Error("Base fixture email helper changed; refusing an unsafe patch.");
  patched = patched.replace(emailNeedle, emailReplacement);

  patched = patched.replaceAll('"Ama Mensah"', 'process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner"');
  patched = patched.replaceAll("password: PASSWORD", 'passwordVariable: "EUGENE_ACADEMY_TEST_PASSWORD"');
  patched = patched.replace("const prisma = new PrismaClient();", "const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 300000 } });");
  patched = patched.replace(
    "console.log(JSON.stringify(report, null, 2));",
    'console.log(JSON.stringify({ generatedAt: report.generatedAt, school: report.school, summary: report.summary, accountsCreated: report.accounts.length }));',
  );

  fs.writeFileSync(tempFixturePath, patched, "utf8");
  const child = spawnSync(process.execPath, [tempFixturePath], {
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
    env: {
      ...process.env,
      DATABASE_URL: productionUrl,
      TEST_DATABASE_URL: testUrl,
      TEST_SCHOOL_CODE: SCHOOL_CODE,
      TEST_SCHOOL_NAME: SCHOOL_NAME,
      TEST_SEED_PASSWORD: password,
      EUGENE_ACADEMY_OWNER_EMAIL: OWNER_EMAIL,
      EUGENE_ACADEMY_OWNER_NAME: ownerName,
    },
  });
  cleanupTemp();
  if (child.status !== 0) {
    const stderr = String(child.stderr || "").trim();
    const stdout = String(child.stdout || "").trim();
    throw new Error(`Base fixture failed.${stderr ? `\n${stderr}` : ""}${stdout ? `\n${stdout.slice(-4000)}` : ""}`);
  }
  console.log("[eugene-academy] base realistic fixture completed (credentials redacted).");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}
function makePortrait(index, kind = "student") {
  const width = 64, height = 64;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const backgrounds = [[225,238,242],[236,231,248],[244,235,219],[222,239,227],[239,228,235],[226,233,248]];
  const skins = [[92,58,38],[120,74,48],[143,91,59],[165,105,67],[188,129,87],[104,64,43]];
  const clothes = [[15,118,110],[37,99,235],[124,58,237],[190,84,19],[5,150,105],[79,70,229]];
  const bg = backgrounds[index % backgrounds.length];
  const skin = skins[(index * 3 + (kind === "staff" ? 2 : 0)) % skins.length];
  const shirt = clothes[(index * 5 + (kind === "staff" ? 1 : 0)) % clothes.length];
  function set(x, y, rgb) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = (y * width + x) * 4;
    pixels[p] = rgb[0]; pixels[p+1] = rgb[1]; pixels[p+2] = rgb[2]; pixels[p+3] = 255;
  }
  function rect(x0,y0,x1,y1,rgb){ for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) set(x,y,rgb); }
  function circle(cx,cy,r,rgb){ for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++) if((x-cx)**2+(y-cy)**2<=r*r) set(x,y,rgb); }
  rect(0,0,width,height,bg);
  circle(32,29,18,skin);
  circle(32,22,18,[38,29,25]);
  rect(15,23,49,34,skin);
  circle(25,29,2,[31,41,55]); circle(39,29,2,[31,41,55]);
  rect(27,39,37,41,[117,49,56]);
  circle(18,33,4,skin); circle(46,33,4,skin);
  circle(32,65,24,shirt);
  rect(24,47,40,56,skin);
  if (kind === "staff") { rect(17,52,47,55,[246,248,250]); rect(29,52,35,64,[30,41,59]); }
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y=0;y<height;y++) {
    const offset=y*(width*4+1); raw[offset]=0;
    pixels.copy(raw, offset+1, y*width*4, (y+1)*width*4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const png = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
function makeCrest() {
  return makePortrait(97, "staff");
}
function date(value) { return new Date(`${value}T00:00:00.000Z`); }
function id(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`.slice(0, 95);
}
function phone(index) { return `+23326${String(7000000 + index).slice(-7)}`; }
function email(slug) { return `${slug}.${SCHOOL_CODE}@test.sukuunova.local`; }

async function makePdf(title, subtitle, lines) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 790;
  page.drawText(SCHOOL_NAME.toUpperCase(), { x: 48, y, size: 18, font: bold }); y -= 28;
  page.drawText(title, { x: 48, y, size: 14, font: bold }); y -= 20;
  page.drawText(subtitle, { x: 48, y, size: 10, font: regular }); y -= 28;
  for (const line of lines) {
    const text = String(line);
    const chunks = [];
    let remaining = text;
    while (remaining.length > 88) {
      let cut = remaining.lastIndexOf(" ", 88);
      if (cut < 45) cut = 88;
      chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut).trim();
    }
    chunks.push(remaining);
    for (const chunk of chunks) {
      if (y < 70) y = 70;
      page.drawText(chunk, { x: 54, y, size: 9.5, font: regular }); y -= 15;
    }
    y -= 3;
  }
  return Buffer.from(await pdf.save());
}

async function main() {
  patchAndRunBaseFixture();

  process.env.DATABASE_URL = testUrl;
  const prisma = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 300000 } });
  try {
    const school = await prisma.school.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
    if (!school) throw new Error("Eugene Academy was not created by the base fixture.");
    const schoolId = school.id;
    const passwordHash = await hash(password, 12);

    const coverage = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);

      const roles = await tx.role.findMany({ where: { schoolId } });
      const roleByName = new Map(roles.map((role) => [role.name, role]));
      const requiredRoles = ["Owner","Principal","Accountant","Class Teacher","Subject Teacher","HR Officer","Transport Officer","Front Desk/Gate Security","Parent","Student","Academic Coordinator","Department Head","Admissions Officer"];
      for (const roleName of requiredRoles) if (!roleByName.has(roleName)) throw new Error(`Required role missing: ${roleName}`);

      await tx.school.update({
        where: { id: schoolId },
        data: {
          name: SCHOOL_NAME,
          logoUrl: makeCrest(),
          brandColors: { primary: "#0f766e", secondary: "#0f172a", accent: "#2dd4bf", surface: "#f8fafc" },
          status: "active",
        },
      });

      const owner = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: OWNER_EMAIL } } });
      if (!owner) throw new Error("Eugene Academy owner account was not created with the requested email.");
      await tx.user.update({ where: { id: owner.id }, data: { name: ownerName, passwordHash, status: "active", needsPasswordChange: false } });
      await tx.$executeRawUnsafe(`UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`, schoolId, owner.id, makePortrait(1, "staff"));

      const classes = await tx.class.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
      const subjects = await tx.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
      const students = await tx.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" } });
      if (!classes.length || !subjects.length || !students.length) throw new Error("Base academic data is incomplete.");

      const currentYear = await tx.academicYear.upsert({
        where: { schoolId_name: { schoolId, name: "2026/2027" } },
        update: { startDate: date("2026-09-07"), endDate: date("2027-07-23"), isLocked: false },
        create: { schoolId, name: "2026/2027", startDate: date("2026-09-07"), endDate: date("2027-07-23"), isLocked: false },
      });
      const termDefs = [
        ["Term 1","2026-09-07","2026-12-18",false],
        ["Term 2","2027-01-11","2027-04-09",false],
        ["Term 3","2027-04-26","2027-07-23",false],
      ];
      const currentTerms = {};
      for (const [name,start,end,locked] of termDefs) {
        currentTerms[name] = await tx.term.upsert({
          where: { schoolId_academicYearId_name: { schoolId, academicYearId: currentYear.id, name } },
          update: { startDate: date(start), endDate: date(end), isLocked: locked },
          create: { schoolId, academicYearId: currentYear.id, name, startDate: date(start), endDate: date(end), isLocked: locked },
        });
      }
      const currentTerm = currentTerms["Term 1"];

      const calendarRows = [
        ["2026 Term 1 Resumption","academic","2026-09-07","2026-09-07",true,true],
        ["New Family Orientation","orientation","2026-09-08","2026-09-08",false,false],
        ["Founders Day Celebration","event","2026-09-21","2026-09-21",false,false],
        ["First Continuous Assessment","exam","2026-10-05","2026-10-09",true,false],
        ["Mid-term Break","break","2026-10-26","2026-10-30",false,true],
        ["PTA Open Day","pta","2026-11-14","2026-11-14",false,false],
        ["Mock Examination Week","exam","2026-11-23","2026-11-27",true,false],
        ["Christmas Vacation","break","2026-12-19","2027-01-10",false,true],
      ];
      for (const [name,type,start,end,attendance,transport] of calendarRows) {
        const exists = await tx.calendarEvent.findFirst({ where: { schoolId, academicYearId: currentYear.id, name } });
        if (exists) await tx.calendarEvent.update({ where: { id: exists.id }, data: { type, startDate: date(start), endDate: date(end), affectsAttendance: attendance, affectsTransport: transport } });
        else await tx.calendarEvent.create({ data: { schoolId, academicYearId: currentYear.id, type, name, startDate: date(start), endDate: date(end), affectsAttendance: attendance, affectsTransport: transport } });
      }

      const staffNames = [
        "Nana Owusu","Esi Addo","Akosua Frimpong","Michael Antwi","Selina Osei","Samuel Darko","Priscilla Agyeman","Emmanuel Opoku","Diana Arthur",
        "Josephine Kwarteng","Richmond Adjei","Patricia Gyasi","Felix Appiah","Naomi Amankwah","Bernard Aidoo","Grace Nyarko","Kwabena Amoako"
      ];
      const classTeacherUsers = [];
      const subjectTeacherUsers = [];
      const existingClassTeacher = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: email("class.teacher") } } });
      const existingSubjectTeacher = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: email("subject.teacher") } } });
      if (!existingClassTeacher || !existingSubjectTeacher) throw new Error("Base teacher accounts are missing.");
      classTeacherUsers.push(existingClassTeacher);
      subjectTeacherUsers.push(existingSubjectTeacher);

      async function ensureRoleUser(slug, name, roleName, n) {
        const userEmail = email(slug);
        const user = await tx.user.upsert({
          where: { schoolId_email: { schoolId, email: userEmail } },
          update: { name, passwordHash, phone: phone(200+n), status: "active", needsPasswordChange: false },
          create: { schoolId, name, email: userEmail, phone: phone(200+n), passwordHash, status: "active", needsPasswordChange: false },
        });
        const role = roleByName.get(roleName);
        await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: { schoolId }, create: { schoolId, userId: user.id, roleId: role.id } });
        await tx.$executeRawUnsafe(`UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`, schoolId, user.id, makePortrait(20+n, "staff"));
        return user;
      }

      for (let i=1;i<classes.length;i++) classTeacherUsers.push(await ensureRoleUser(`class.teacher.${i+1}`, staffNames[i % staffNames.length], "Class Teacher", i));
      for (let i=1;i<subjects.length;i++) subjectTeacherUsers.push(await ensureRoleUser(`subject.teacher.${i+1}`, staffNames[(i+8) % staffNames.length], "Subject Teacher", 20+i));

      await tx.classSubjectTeacher.deleteMany({ where: { schoolId } });
      for (let i=0;i<classes.length;i++) {
        await tx.class.update({ where: { id: classes[i].id }, data: { classTeacherId: classTeacherUsers[i % classTeacherUsers.length].id } });
        for (let j=0;j<subjects.length;j++) {
          const teacher = subjectTeacherUsers[(j + i) % subjectTeacherUsers.length];
          await tx.classSubjectTeacher.create({ data: { schoolId, classId: classes[i].id, subjectId: subjects[j].id, teacherId: teacher.id } });
        }
      }

      const allStaff = await tx.$queryRawUnsafe(
        `SELECT DISTINCT u."id",u."name",u."email" FROM "User" u
         JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
         JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
         WHERE u."schoolId"=$1 AND r."name" NOT IN ('Parent','Student') ORDER BY u."name"`,
        schoolId,
      );
      for (let i=0;i<allStaff.length;i++) {
        await tx.$executeRawUnsafe(`UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`, schoolId, allStaff[i].id, makePortrait(100+i, "staff"));
      }
      for (let i=0;i<students.length;i++) await tx.student.update({ where: { id: students[i].id }, data: { photoUrl: makePortrait(i+1, "student") } });

      const parentRole = roleByName.get("Parent");
      const guardians = await tx.guardian.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
      for (let i=guardians.length;i<90;i++) {
        const n=i+1, guardianEmail=email(`guardian${n}`), guardianPhone=phone(500+n);
        const guardian = await tx.guardian.create({ data: { schoolId, name: `Eugene Family Guardian ${n}`, phone: guardianPhone, email: guardianEmail } });
        const guardianUser = await tx.user.upsert({
          where: { schoolId_email: { schoolId, email: guardianEmail } },
          update: { name: guardian.name, phone: guardianPhone, passwordHash, status: "active", needsPasswordChange: false },
          create: { schoolId, name: guardian.name, email: guardianEmail, phone: guardianPhone, passwordHash, status: "active", needsPasswordChange: false },
        });
        await tx.userRole.upsert({ where: { userId_roleId: { userId: guardianUser.id, roleId: parentRole.id } }, update: { schoolId }, create: { schoolId, userId: guardianUser.id, roleId: parentRole.id } });
        await tx.guardian.update({ where: { id: guardian.id }, data: { userId: guardianUser.id } });
        guardians.push({ ...guardian, userId: guardianUser.id });
      }
      for (let i=0;i<guardians.length;i++) {
        if (!guardians[i].userId && guardians[i].email) {
          const guardianUser = await tx.user.upsert({
            where: { schoolId_email: { schoolId, email: guardians[i].email } },
            update: { name: guardians[i].name, phone: guardians[i].phone, passwordHash, status: "active", needsPasswordChange: false },
            create: { schoolId, name: guardians[i].name, email: guardians[i].email, phone: guardians[i].phone, passwordHash, status: "active", needsPasswordChange: false },
          });
          await tx.userRole.upsert({ where: { userId_roleId: { userId: guardianUser.id, roleId: parentRole.id } }, update: { schoolId }, create: { schoolId, userId: guardianUser.id, roleId: parentRole.id } });
          guardians[i] = await tx.guardian.update({ where: { id: guardians[i].id }, data: { userId: guardianUser.id } });
        }
      }
      for (let i=0;i<students.length;i++) {
        const existingLinks = await tx.studentGuardian.count({ where: { schoolId, studentId: students[i].id } });
        if (!existingLinks) {
          const guardian = guardians[i % guardians.length];
          await tx.studentGuardian.create({ data: { schoolId, studentId: students[i].id, guardianId: guardian.id, relationship: "Parent/Guardian", isPrimary: true } });
        }
      }
      for (let i=0;i<Math.min(24, students.length);i++) {
        const second = guardians[(i+37) % guardians.length];
        await tx.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: students[i].id, guardianId: second.id } },
          update: { relationship: "Emergency contact", isPrimary: false, schoolId },
          create: { schoolId, studentId: students[i].id, guardianId: second.id, relationship: "Emergency contact", isPrimary: false },
        });
      }

      const studentRole = roleByName.get("Student");
      for (let i=0;i<Math.min(24,students.length);i++) {
        const portalEmail = email(`student${i+1}`);
        const account = await tx.user.upsert({
          where: { schoolId_email: { schoolId, email: portalEmail } },
          update: { name: `${students[i].name} Portal`, passwordHash, status: "active", needsPasswordChange: false },
          create: { schoolId, name: `${students[i].name} Portal`, email: portalEmail, passwordHash, status: "active", needsPasswordChange: false },
        });
        await tx.userRole.upsert({ where: { userId_roleId: { userId: account.id, roleId: studentRole.id } }, update: { schoolId }, create: { schoolId, userId: account.id, roleId: studentRole.id } });
      }

      await tx.schoolSettings.update({
        where: { schoolId },
        data: {
          timezone: "Africa/Accra",
          attendanceGraceMinutes: 10,
          notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false },
          timetableConfig: { schoolDays: [1,2,3,4,5], periodsPerDay: 8, firstPeriod: "08:00", periodMinutes: 45, breaks: [{ afterPeriod: 2, minutes: 20 }, { afterPeriod: 5, minutes: 40 }] },
          assessmentConfig: { caWeight: 40, examWeight: 60, requireModeration: true, currentAcademicYear: "2026/2027" },
          reportCardConfig: { showStudentPhoto: true, showOverallPosition: true, showSubjectPosition: true, verifiedWorkflow: true },
          expectedResumptionTime: "07:45",
          gradeCaWeight: new Prisma.Decimal(40),
          gradeExamWeight: new Prisma.Decimal(60),
          allowPartialReportCards: true,
        },
      });

      // Current-year enrolment states exercise ready/confirmed/draft workflow.
      for (let i=0;i<students.length;i++) {
        const status = i < 200 ? "confirmed" : i < 215 ? "ready" : "draft";
        await tx.$executeRawUnsafe(
          `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","enrollmentDate","startDate","guardianVerified","documentsReady","feeReady","notes","createdBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'continuing',$8,$8,$9,$10,$11,$12,$13,NOW(),NOW())
           ON CONFLICT ("schoolId","studentId","academicYearId","termId") DO UPDATE SET "status"=EXCLUDED."status","classId"=EXCLUDED."classId","guardianVerified"=EXCLUDED."guardianVerified","documentsReady"=EXCLUDED."documentsReady","feeReady"=EXCLUDED."feeReady","notes"=EXCLUDED."notes","updatedAt"=NOW()`,
          id("eug-enrol", i+1), schoolId, students[i].id, currentYear.id, currentTerm.id, students[i].classId, status, date("2026-09-07"),
          i % 13 !== 0, i % 17 !== 0, i % 11 !== 0, status === "confirmed" ? "Continuing learner verified for Term 1." : "Synthetic trial record intentionally awaiting one readiness item.", owner.id,
        );
      }

      const enquiryStages = ["new","contacted","interested","visit","applied","converted"];
      for (let i=0;i<18;i++) {
        const stage = enquiryStages[i % enquiryStages.length];
        const convertedStudent = stage === "converted" ? students[210 + (i % 10)] : null;
        await tx.$executeRawUnsafe(
          `INSERT INTO "AdmissionEnquiry" ("id","schoolId","reference","studentName","guardianName","phone","email","intendedClass","source","stage","ownerId","nextFollowUpAt","lastContactAt","visitAt","notes","convertedStudentId","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
           ON CONFLICT ("schoolId","reference") DO UPDATE SET "stage"=EXCLUDED."stage","ownerId"=EXCLUDED."ownerId","nextFollowUpAt"=EXCLUDED."nextFollowUpAt","lastContactAt"=EXCLUDED."lastContactAt","visitAt"=EXCLUDED."visitAt","notes"=EXCLUDED."notes","convertedStudentId"=EXCLUDED."convertedStudentId","updatedAt"=NOW()`,
          id("eug-enq", i+1), schoolId, `EUG-ENQ-${String(i+1).padStart(4,"0")}`, `Prospective Learner ${i+1}`, `Prospective Guardian ${i+1}`, phone(800+i), `prospect${i+1}@example.test`,
          classes[i % classes.length].name, ["website","referral","phone","walk_in","social","event"][i%6], stage, owner.id,
          stage === "converted" ? null : date(`2026-09-${String(11 + (i%12)).padStart(2,"0")}`),
          i % 3 ? date("2026-09-09") : null, stage === "visit" || stage === "applied" ? date("2026-09-12") : null,
          `Synthetic ${stage} admissions case for end-to-end testing.`, convertedStudent?.id ?? null, date(`2026-09-${String(1 + (i%9)).padStart(2,"0")}`),
        );
      }

      // Full working timetable: 8 periods x 5 weekdays x all classes.
      const assignmentRows = await tx.classSubjectTeacher.findMany({ where: { schoolId }, select: { classId: true, subjectId: true, teacherId: true } });
      const assignmentMap = new Map(assignmentRows.map((row) => [`${row.classId}:${row.subjectId}`, row.teacherId]));
      for (let ci=0;ci<classes.length;ci++) {
        for (let dayOfWeek=1;dayOfWeek<=5;dayOfWeek++) {
          for (let period=1;period<=8;period++) {
            const subject = subjects[(ci + dayOfWeek + period - 2) % subjects.length];
            const teacherId = assignmentMap.get(`${classes[ci].id}:${subject.id}`) || subjectTeacherUsers[0].id;
            await tx.timetableSlot.upsert({
              where: { schoolId_classId_dayOfWeek_period: { schoolId, classId: classes[ci].id, dayOfWeek, period } },
              update: { subjectId: subject.id, teacherId, venue: period === 4 && subject.name.toLowerCase().includes("comput") ? "ICT Lab 1" : `Room ${ci+1}` },
              create: { schoolId, classId: classes[ci].id, subjectId: subject.id, teacherId, dayOfWeek, period, venue: period === 4 && subject.name.toLowerCase().includes("comput") ? "ICT Lab 1" : `Room ${ci+1}` },
            });
          }
        }
      }

      const reviewer = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: email("academic") } } }) || owner;
      const principal = await tx.user.findUnique({ where: { schoolId_email: { schoolId, email: email("principal") } } }) || reviewer;
      const lessonStatuses = ["approved","submitted","draft","changes_requested","completed","approved","submitted","approved","draft","completed","approved","changes_requested"];
      const lessonTitles = ["Fractions and Ratios","Reading for Meaning","Ecosystems and Food Chains","Civic Responsibility","Safe Computing Practice","French Classroom Language","Creative Perspective Drawing","Fitness and Coordination","Linear Expressions","Narrative Writing","States of Matter","Citizenship and Local Government"];
      for (let i=0;i<lessonTitles.length;i++) {
        const cls=classes[i%classes.length], subject=subjects[i%subjects.length], teacherId=assignmentMap.get(`${cls.id}:${subject.id}`) || classTeacherUsers[0].id;
        const status=lessonStatuses[i];
        const planId=id("eug-lp",i+1);
        const planned = date(`2026-09-${String(8 + (i%10)).padStart(2,"0")}`);
        const reviewedAt = ["approved","changes_requested","completed"].includes(status) ? date("2026-09-10") : null;
        await tx.$executeRawUnsafe(
          `INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","objective","content","plannedDate","status","reviewerId","reviewNote","reviewedAt","topic","subTopic","curriculumObjective","learningOutcomes","priorKnowledge","materials","introduction","development","differentiatedActivities","assessment","conclusion","homework","reflection","resources","submittedAt","completedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb,$29,$30,NOW(),NOW())
           ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","objective"=EXCLUDED."objective","content"=EXCLUDED."content","plannedDate"=EXCLUDED."plannedDate","status"=EXCLUDED."status","reviewerId"=EXCLUDED."reviewerId","reviewNote"=EXCLUDED."reviewNote","reviewedAt"=EXCLUDED."reviewedAt","topic"=EXCLUDED."topic","subTopic"=EXCLUDED."subTopic","curriculumObjective"=EXCLUDED."curriculumObjective","learningOutcomes"=EXCLUDED."learningOutcomes","priorKnowledge"=EXCLUDED."priorKnowledge","materials"=EXCLUDED."materials","introduction"=EXCLUDED."introduction","development"=EXCLUDED."development","differentiatedActivities"=EXCLUDED."differentiatedActivities","assessment"=EXCLUDED."assessment","conclusion"=EXCLUDED."conclusion","homework"=EXCLUDED."homework","reflection"=EXCLUDED."reflection","resources"=EXCLUDED."resources","submittedAt"=EXCLUDED."submittedAt","completedAt"=EXCLUDED."completedAt","updatedAt"=NOW()`,
          planId,schoolId,teacherId,cls.id,subject.id,currentTerm.id,lessonTitles[i],
          `Learners will demonstrate practical understanding of ${lessonTitles[i].toLowerCase()}.`,
          `Starter, guided modelling, collaborative practice, independent practice and plenary for ${lessonTitles[i]}.`, planned,status,
          reviewedAt ? reviewer.id : null,
          status==="changes_requested" ? "Strengthen differentiation and make the exit assessment more explicit." : status==="approved" || status==="completed" ? "Curriculum alignment and classroom flow verified." : null,
          reviewedAt, lessonTitles[i], i%2 ? "Applied practice" : "Core concept", `Curriculum objective ${i+1}: apply knowledge accurately in class and real-life contexts.`,
          "Explain the concept; apply it independently; reflect on errors.", "Recall prerequisite vocabulary and last lesson examples.",
          "Board, learner textbook, locally available manipulatives and projected examples.", "Use a short retrieval question and connect responses to today's objective.",
          "Model one example, guide two examples, then move learners into pair and individual practice.", "Support group gets scaffold cards; extension group completes a challenge task.",
          "Teacher questioning, observation checklist and a five-minute exit ticket.", "Review the objective and ask two learners to explain the key idea.",
          "Complete the follow-up practice and write one question you still have.", status==="completed" ? "Most learners met the objective; reteach one misconception during the next starter." : null,
          JSON.stringify([{type:"library",title:"Eugene Academy learner resource",url:"/school/library"},{type:"note",title:"Teacher prepared board summary"}]),
          status==="draft" ? null : date("2026-09-09"), status==="completed" ? date("2026-09-10") : null,
        );
        if (reviewedAt) {
          const decision=status==="changes_requested" ? "changes_requested" : "approved";
          await tx.$executeRawUnsafe(
            `INSERT INTO "LessonPlanReview" ("id","schoolId","lessonPlanId","reviewerId","decision","reasonCode","note","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT ("id") DO UPDATE SET "decision"=EXCLUDED."decision","reasonCode"=EXCLUDED."reasonCode","note"=EXCLUDED."note"`,
            id("eug-lpr",i+1),schoolId,planId,reviewer.id,decision,decision==="changes_requested"?"differentiation":"curriculum_alignment",
            decision==="approved"?"Approved for classroom delivery.":"Add clearer support and extension activities.",reviewedAt,
          );
        }
      }

      // Teacher notes visible in guardian academic workspace.
      for (let i=0;i<16;i++) {
        const cls=classes[i%classes.length], subject=subjects[i%subjects.length], teacherId=assignmentMap.get(`${cls.id}:${subject.id}`) || classTeacherUsers[0].id;
        const status=i%5===0?"draft":"published";
        await tx.$executeRawUnsafe(
          `INSERT INTO "TeacherAcademicNote" ("id","schoolId","termId","classId","subjectId","teacherId","title","content","weekNumber","status","publishedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,NOW(),NOW())
           ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","content"=EXCLUDED."content","weekNumber"=EXCLUDED."weekNumber","status"=EXCLUDED."status","publishedAt"=EXCLUDED."publishedAt","updatedAt"=NOW()`,
          id("eug-note",i+1),schoolId,currentTerm.id,cls.id,subject.id,teacherId,
          `${subject.name}: Week ${1+(i%3)} Study Note`,
          JSON.stringify({ summary:`A concise learner note for ${subject.name}.`, keyPoints:["Remember the core definition.","Study the worked example.","Try the checkpoint question without notes."], example:"Teacher worked example recorded during class.", reflection:"Explain the idea in your own words before the next lesson." }),
          1+(i%3),status,status==="published"?date("2026-09-10"):null,
        );
      }

      // Current assessments and marks give the gradebook meaningful early-term data.
      const currentAssessments=[];
      for (const cls of classes) for (const subject of subjects) {
        const exercise=await tx.assessment.upsert({
          where:{schoolId_termId_classId_subjectId_name:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:"Class Exercise 1"}},
          update:{type:"ca",weight:new Prisma.Decimal(15),maxScore:new Prisma.Decimal(20)},
          create:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:"Class Exercise 1",type:"ca",weight:new Prisma.Decimal(15),maxScore:new Prisma.Decimal(20)},
        });
        const quiz=await tx.assessment.upsert({
          where:{schoolId_termId_classId_subjectId_name:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:"Baseline Quiz"}},
          update:{type:"ca",weight:new Prisma.Decimal(25),maxScore:new Prisma.Decimal(40)},
          create:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:"Baseline Quiz",type:"ca",weight:new Prisma.Decimal(25),maxScore:new Prisma.Decimal(40)},
        });
        currentAssessments.push([cls,subject,exercise,quiz]);
      }
      const byClass=new Map(classes.map(c=>[c.id,students.filter(s=>s.classId===c.id)]));
      for (const [cls,subject,exercise,quiz] of currentAssessments) {
        const teacherId=assignmentMap.get(`${cls.id}:${subject.id}`) || subjectTeacherUsers[0].id;
        const roster=byClass.get(cls.id)||[];
        for (let i=0;i<roster.length;i++) {
          const ex=9+((i+subject.name.length)%12), q=19+((i*3+subject.name.length)%22);
          await tx.score.upsert({where:{studentId_assessmentId:{studentId:roster[i].id,assessmentId:exercise.id}},update:{value:new Prisma.Decimal(ex),status:i%31===0?"excused":"present",remarks:ex>=16?"Strong start":"Keep practising the worked examples.",enteredBy:teacherId},create:{schoolId,studentId:roster[i].id,subjectId:subject.id,assessmentId:exercise.id,value:new Prisma.Decimal(ex),status:i%31===0?"excused":"present",remarks:ex>=16?"Strong start":"Keep practising the worked examples.",enteredBy:teacherId}});
          await tx.score.upsert({where:{studentId_assessmentId:{studentId:roster[i].id,assessmentId:quiz.id}},update:{value:new Prisma.Decimal(q),status:i%37===0?"absent":"present",remarks:q>=32?"Excellent baseline":"Review the Week 1 note.",enteredBy:teacherId},create:{schoolId,studentId:roster[i].id,subjectId:subject.id,assessmentId:quiz.id,value:new Prisma.Decimal(q),status:i%37===0?"absent":"present",remarks:q>=32?"Excellent baseline":"Review the Week 1 note.",enteredBy:teacherId}});
        }
      }

      // Interactive homework/exercises with real academic-work, questions, submissions and linked gradebook assessments.
      const homeworkTitles=["Ratio Practice Set","Reading Evidence Journal","Ecosystem Diagram","Civic Reflection","Computer Lab Safety","French Vocabulary Check","Creative Arts Perspective Task","Fitness Reflection Log","Algebra Exit Challenge","Narrative Paragraph","Matter Classification","Community Leadership"];
      for (let i=0;i<homeworkTitles.length;i++) {
        const cls=classes[i%classes.length], subject=subjects[i%subjects.length], teacherId=assignmentMap.get(`${cls.id}:${subject.id}`)||classTeacherUsers[0].id;
        const workId=id("eug-work",i+1), questionId=id("eug-question",i+1), maxScore=20+(i%3)*5;
        const assessment=await tx.assessment.upsert({
          where:{schoolId_termId_classId_subjectId_name:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:`${homeworkTitles[i]} [${workId}]`}},
          update:{type:"ca",weight:new Prisma.Decimal(100),maxScore:new Prisma.Decimal(maxScore)},
          create:{schoolId,termId:currentTerm.id,classId:cls.id,subjectId:subject.id,name:`${homeworkTitles[i]} [${workId}]`,type:"ca",weight:new Prisma.Decimal(100),maxScore:new Prisma.Decimal(maxScore)},
        });
        const due=date(`2026-09-${String(14+(i%5)).padStart(2,"0")}`);
        await tx.$executeRawUnsafe(
          `INSERT INTO "TeacherAcademicWork" ("id","schoolId","termId","classId","subjectId","teacherId","kind","title","instructions","workDate","weekNumber","workNumber","maxScore","markingMode","answerGuide","dueAt","status","publishedAt","assessmentId","attemptLimit","attemptScorePolicy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'Homework',$7,$8,$9::date,$10,$11,$12,'manual',$13::jsonb,$14,'published',$15,$16,$17,$18,NOW(),NOW())
           ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","instructions"=EXCLUDED."instructions","maxScore"=EXCLUDED."maxScore","dueAt"=EXCLUDED."dueAt","status"='published',"publishedAt"=EXCLUDED."publishedAt","assessmentId"=EXCLUDED."assessmentId","attemptLimit"=EXCLUDED."attemptLimit","attemptScorePolicy"=EXCLUDED."attemptScorePolicy","updatedAt"=NOW()`,
          workId,schoolId,currentTerm.id,cls.id,subject.id,teacherId,homeworkTitles[i],
          `Complete ${homeworkTitles[i].toLowerCase()} and explain your reasoning clearly.`, "2026-09-10",1,1+(i%4),maxScore,
          JSON.stringify({rubric:["Accuracy","Reasoning","Presentation"]}),due,date("2026-09-10"),assessment.id,i%4===0?2:1,i%4===0?"highest":"latest",
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "TeacherAcademicQuestion" ("id","schoolId","workId","position","type","prompt","points","options","acceptedAnswers")
           VALUES ($1,$2,$3,1,'long_answer',$4,$5,'[]'::jsonb,'[]'::jsonb)
           ON CONFLICT ("workId","position") DO UPDATE SET "prompt"=EXCLUDED."prompt","points"=EXCLUDED."points"`,
          questionId,schoolId,workId,`Submit your response for "${homeworkTitles[i]}".`,maxScore,
        );
        const reviewStatus=i%4===2?"changes_requested":i%5===3?"not_reviewed":"approved";
        await tx.$executeRawUnsafe(
          `INSERT INTO "Homework" ("id","schoolId","teacherId","classId","subjectId","termId","title","instructions","dueDate","points","assignmentStatus","reviewStatus","reviewerId","reviewNote","reviewedAt","academicWorkId","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'assigned',$11,$12,$13,$14,$15,NOW(),NOW())
           ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","instructions"=EXCLUDED."instructions","dueDate"=EXCLUDED."dueDate","points"=EXCLUDED."points","assignmentStatus"=EXCLUDED."assignmentStatus","reviewStatus"=EXCLUDED."reviewStatus","reviewerId"=EXCLUDED."reviewerId","reviewNote"=EXCLUDED."reviewNote","reviewedAt"=EXCLUDED."reviewedAt","academicWorkId"=EXCLUDED."academicWorkId","updatedAt"=NOW()`,
          id("eug-hw",i+1),schoolId,teacherId,cls.id,subject.id,currentTerm.id,homeworkTitles[i],
          `Complete the assignment by ${due.toISOString().slice(0,10)}. Show all working and submit through the learner activity.`,due,maxScore,reviewStatus,
          reviewStatus==="not_reviewed"?null:reviewer.id,reviewStatus==="approved"?"Academic review completed.":"Clarify the success criteria before the next cycle.",reviewStatus==="not_reviewed"?null:date("2026-09-10"),workId,
        );
        const roster=(byClass.get(cls.id)||[]).slice(0,8);
        for (let s=0;s<roster.length;s++) {
          if (s===7) continue;
          const submissionId=id(`eug-sub-${i+1}`,s+1);
          const status=s<4?"graded":s<6?"submitted":"in_progress";
          const awarded=status==="graded"?Math.max(1,maxScore-2-s):null;
          await tx.$executeRawUnsafe(
            `INSERT INTO "TeacherAcademicSubmission" ("id","schoolId","workId","studentId","startedAt","submittedAt","status","totalAwarded","reviewedBy","reviewedAt","reviewNotes","attemptNumber","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,NOW(),NOW())
             ON CONFLICT ("workId","studentId","attemptNumber") DO UPDATE SET "startedAt"=EXCLUDED."startedAt","submittedAt"=EXCLUDED."submittedAt","status"=EXCLUDED."status","totalAwarded"=EXCLUDED."totalAwarded","reviewedBy"=EXCLUDED."reviewedBy","reviewedAt"=EXCLUDED."reviewedAt","reviewNotes"=EXCLUDED."reviewNotes","updatedAt"=NOW()`,
            submissionId,schoolId,workId,roster[s].id,date("2026-09-10"),status==="in_progress"?null:date("2026-09-10"),status,awarded,status==="graded"?teacherId:null,status==="graded"?date("2026-09-10"):null,status==="graded"?"Marked with rubric feedback.":null,
          );
          const actualSubmission=await tx.$queryRawUnsafe(`SELECT "id" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 AND "studentId"=$3 AND "attemptNumber"=1 LIMIT 1`,schoolId,workId,roster[s].id);
          const sid=actualSubmission[0].id;
          await tx.$executeRawUnsafe(
            `INSERT INTO "TeacherAcademicAnswer" ("id","schoolId","submissionId","questionId","responseText","responseData","awardedScore","markingMode","markerComment","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7,$8,NOW(),NOW())
             ON CONFLICT ("submissionId","questionId") DO UPDATE SET "responseText"=EXCLUDED."responseText","awardedScore"=EXCLUDED."awardedScore","markingMode"=EXCLUDED."markingMode","markerComment"=EXCLUDED."markerComment","updatedAt"=NOW()`,
            id(`eug-answer-${i+1}`,s+1),schoolId,sid,questionId,
            `Synthetic learner response ${s+1}: I completed the task and explained the main idea with a worked example.`,
            awarded,status==="graded"?"manual":null,status==="graded"?"Good reasoning. Check the final step for full marks.":null,
          );
          if (status==="graded") {
            await tx.score.upsert({where:{studentId_assessmentId:{studentId:roster[s].id,assessmentId:assessment.id}},update:{value:new Prisma.Decimal(awarded),status:"present",remarks:"Homework graded from learner submission.",enteredBy:teacherId},create:{schoolId,studentId:roster[s].id,subjectId:subject.id,assessmentId:assessment.id,value:new Prisma.Decimal(awarded),status:"present",remarks:"Homework graded from learner submission.",enteredBy:teacherId}});
          }
        }
      }

      // Current term fees/invoices/payments.
      const feeDefs=[["Tuition",1950],["ICT & Digital Learning",220],["Feeding",450],["Transport",600],["Activities",150]];
      const feeItems=[];
      for (const [name,amount] of feeDefs) feeItems.push(await tx.feeItem.upsert({
        where:{schoolId_termId_classId_name:{schoolId,termId:currentTerm.id,classId:null,name}},
        update:{amount:new Prisma.Decimal(amount)},
        create:{schoolId,termId:currentTerm.id,classId:null,name,amount:new Prisma.Decimal(amount)},
      }));
      const total=feeDefs.reduce((sum,row)=>sum+row[1],0);
      for (let i=0;i<students.length;i++) {
        const invoice=await tx.invoice.upsert({
          where:{studentId_termId:{studentId:students[i].id,termId:currentTerm.id}},
          update:{totalAmount:new Prisma.Decimal(total),status:i<45?"part_paid":i<60?"paid":"unpaid"},
          create:{schoolId,studentId:students[i].id,termId:currentTerm.id,totalAmount:new Prisma.Decimal(total),status:i<45?"part_paid":i<60?"paid":"unpaid"},
        });
        for (const item of feeItems) await tx.invoiceLine.upsert({where:{invoiceId_feeItemId:{invoiceId:invoice.id,feeItemId:item.id}},update:{amount:item.amount,schoolId},create:{schoolId,invoiceId:invoice.id,feeItemId:item.id,amount:item.amount}});
        if (i<60) {
          const amount=i<45?1200:total;
          await tx.payment.upsert({
            where:{schoolId_reference:{schoolId,reference:`EUG-T1-2026-${students[i].admissionNo}`}},
            update:{amount:new Prisma.Decimal(amount),method:i%3===0?"mobile_money":i%3===1?"bank_transfer":"cash",invoiceId:invoice.id,reconciledBy:owner.id},
            create:{schoolId,invoiceId:invoice.id,amount:new Prisma.Decimal(amount),method:i%3===0?"mobile_money":i%3===1?"bank_transfer":"cash",reference:`EUG-T1-2026-${students[i].admissionNo}`,reconciledBy:owner.id,createdAt:date("2026-09-09")},
          });
        }
      }

      // Daily feeding: breakfast, lunch and dinner for one school week.
      const feedingMeals=[
        ["Breakfast",["Hausa koko","Koose","Banana"],185],
        ["Lunch",["Jollof rice","Chicken","Cabbage salad","Water"],620],
        ["Dinner",["Yam ampesi","Kontomire stew","Egg","Orange"],540],
      ];
      for (let dayIndex=0;dayIndex<5;dayIndex++) {
        const menuDate=`2026-09-${String(7+dayIndex).padStart(2,"0")}`;
        for (let m=0;m<feedingMeals.length;m++) {
          const [meal,items,cost]=feedingMeals[m], menuId=id("eug-menu",`${menuDate}-${meal}`);
          await tx.$executeRawUnsafe(
            `INSERT INTO "P3FeedingMenu" ("id","schoolId","menuDate","meal","items","plannedCost","createdBy","createdAt")
             VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())
             ON CONFLICT ("id") DO UPDATE SET "items"=EXCLUDED."items","plannedCost"=EXCLUDED."plannedCost"`,
            menuId,schoolId,date(menuDate),meal,JSON.stringify(items),cost,owner.id,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "P3FeedingLog" ("id","schoolId","menuId","logDate","meal","servedCount","actualCost","notes","createdBy","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
             ON CONFLICT ("id") DO UPDATE SET "servedCount"=EXCLUDED."servedCount","actualCost"=EXCLUDED."actualCost","notes"=EXCLUDED."notes"`,
            id("eug-feedlog",`${menuDate}-${meal}`),schoolId,menuId,date(menuDate),meal,205+dayIndex*3+(m*2),cost+15+dayIndex*4,
            m===1?"Lunch service completed; special-diet register checked.":"Synthetic meal service completed normally.",owner.id,
          );
        }
      }

      // Deeper transport history on the existing route/vehicle network.
      const vehicles=await tx.$queryRawUnsafe(`SELECT "id" FROM "P3Vehicle" WHERE "schoolId"=$1 ORDER BY "registrationNumber"`,schoolId);
      const routes=await tx.$queryRawUnsafe(`SELECT "id" FROM "P3BusRoute" WHERE "schoolId"=$1 ORDER BY "code"`,schoolId);
      const stops=await tx.$queryRawUnsafe(`SELECT "id" FROM "P3BusStop" WHERE "schoolId"=$1 ORDER BY "name"`,schoolId);
      const transportUser=await tx.user.findUnique({where:{schoolId_email:{schoolId,email:email("transport")}}}) || owner;
      if (vehicles.length && routes.length) {
        for (let i=0;i<Math.min(45,students.length);i++) {
          const vehicle=vehicles[i%vehicles.length], route=routes[i%routes.length], stop=stops.length?stops[i%stops.length]:null;
          for (const type of ["boarded","alighted"]) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "P3BoardingEvent" ("id","schoolId","vehicleId","routeId","studentId","type","stopId","eventAt","alertQueued","createdBy")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
               ON CONFLICT ("id") DO NOTHING`,
              id("eug-board",`${i+1}-${type}`),schoolId,vehicle.id,route.id,students[i].id,type,stop?.id||null,
              new Date(`2026-09-10T${type==="boarded"?"06:45":"15:35"}:00.000Z`),transportUser.id,
            );
          }
        }
      }

      // Physical devices + identity mappings, without pretending a cloud face enrollment succeeded.
      const mainDevice=await tx.device.upsert({
        where:{schoolId_deviceSerial:{schoolId,deviceSerial:"EUG-FP-GATE-001"}},
        update:{kind:"fingerprint",label:"Main Gate Fingerprint Terminal",apiKeyHash:"synthetic-fixture-no-live-key",status:"active",lastSeenAt:new Date("2026-09-10T07:45:00.000Z")},
        create:{schoolId,deviceSerial:"EUG-FP-GATE-001",kind:"fingerprint",label:"Main Gate Fingerprint Terminal",apiKeyHash:"synthetic-fixture-no-live-key",status:"active",lastSeenAt:new Date("2026-09-10T07:45:00.000Z")},
      });
      for (let i=0;i<Math.min(20,students.length);i++) await tx.deviceIdentity.upsert({
        where:{schoolId_deviceKind_externalId:{schoolId,deviceKind:"fingerprint",externalId:`STU-${String(i+1).padStart(4,"0")}`}},
        update:{studentId:students[i].id,staffId:null},
        create:{schoolId,deviceKind:"fingerprint",externalId:`STU-${String(i+1).padStart(4,"0")}`,studentId:students[i].id},
      });
      for (let i=0;i<Math.min(8,allStaff.length);i++) await tx.deviceIdentity.upsert({
        where:{schoolId_deviceKind_externalId:{schoolId,deviceKind:"fingerprint",externalId:`STF-${String(i+1).padStart(3,"0")}`}},
        update:{staffId:allStaff[i].id,studentId:null},
        create:{schoolId,deviceKind:"fingerprint",externalId:`STF-${String(i+1).padStart(3,"0")}`,staffId:allStaff[i].id},
      });
      await tx.deviceAttendanceReceipt.upsert({
        where:{schoolId_deviceId_idempotencyKey:{schoolId,deviceId:mainDevice.id,idempotencyKey:"eug-synthetic-heartbeat-001"}},
        update:{nonce:"eug-nonce-001",capturedAt:new Date("2026-09-10T07:45:00.000Z"),processedAt:new Date("2026-09-10T07:45:01.000Z")},
        create:{schoolId,deviceId:mainDevice.id,idempotencyKey:"eug-synthetic-heartbeat-001",nonce:"eug-nonce-001",capturedAt:new Date("2026-09-10T07:45:00.000Z"),processedAt:new Date("2026-09-10T07:45:01.000Z")},
      });

      // ID cards for representative students and every operational staff account.
      for (let i=0;i<Math.min(30,students.length);i++) {
        const serial=`EUG-STU-${String(i+1).padStart(5,"0")}`;
        const found=await tx.identityCard.findFirst({where:{schoolId,serial}});
        if (!found) await tx.identityCard.create({data:{schoolId,personType:"student",studentId:students[i].id,serial,expiresAt:date("2027-07-31"),status:"active"}});
      }
      for (let i=0;i<allStaff.length;i++) {
        const serial=`EUG-STF-${String(i+1).padStart(4,"0")}`;
        const found=await tx.identityCard.findFirst({where:{schoolId,serial}});
        if (!found) await tx.identityCard.create({data:{schoolId,personType:"staff",staffId:allStaff[i].id,serial,expiresAt:date("2027-07-31"),status:"active"}});
      }

      // In-app communications must target User.id to appear in teacher/guardian inboxes.
      const guardianUsers=await tx.guardian.findMany({where:{schoolId,userId:{not:null}},select:{id:true,userId:true,phone:true,name:true}});
      const schoolMessages=[
        ["Welcome to Term 1","Term 1 has started. Please review the timetable, transport arrangements and family contact details."],
        ["Homework reminder","New learning activities are available in the Academics workspace. Please check the due dates."],
        ["PTA Open Day","PTA Open Day is scheduled for 14 November. Appointment details will follow."],
        ["Transport update","Morning buses are operating on the published routes. Use the Transport page for the latest status."],
      ];
      for (let i=0;i<Math.min(20,guardianUsers.length);i++) {
        const g=guardianUsers[i], [title,body]=schoolMessages[i%schoolMessages.length];
        await tx.message.upsert({
          where:{schoolId_idempotencyKey:{schoolId,idempotencyKey:`eug-guardian-inapp-${i+1}`}},
          update:{recipientId:g.userId,recipientPhone:g.phone||"",body,status:"delivered",templateVariables:{title,senderType:"school_user",senderId:owner.id,senderName:ownerName,attachments:[],fixture:true,readAt:i%3===0?"2026-09-10T09:00:00.000Z":null}},
          create:{schoolId,channel:"in_app",recipientType:"user",recipientId:g.userId,recipientPhone:g.phone||"",body,templateKey:"direct_message",templateVariables:{title,senderType:"school_user",senderId:owner.id,senderName:ownerName,attachments:[],fixture:true,readAt:i%3===0?"2026-09-10T09:00:00.000Z":null},status:"delivered",attempts:1,sentAt:new Date("2026-09-10T08:00:00.000Z"),idempotencyKey:`eug-guardian-inapp-${i+1}`},
        });
      }
      for (let i=0;i<Math.min(12,allStaff.length);i++) {
        await tx.message.upsert({
          where:{schoolId_idempotencyKey:{schoolId,idempotencyKey:`eug-staff-inapp-${i+1}`}},
          update:{recipientId:allStaff[i].id,recipientPhone:"",body:"Staff briefing: review today's attendance, safeguarding actions and academic tasks before close of day.",status:"delivered",templateVariables:{title:"Daily staff briefing",senderType:"school_user",senderId:principal.id,senderName:principal.name,attachments:[],fixture:true}},
          create:{schoolId,channel:"in_app",recipientType:"user",recipientId:allStaff[i].id,recipientPhone:"",body:"Staff briefing: review today's attendance, safeguarding actions and academic tasks before close of day.",templateKey:"direct_message",templateVariables:{title:"Daily staff briefing",senderType:"school_user",senderId:principal.id,senderName:principal.name,attachments:[],fixture:true},status:"delivered",attempts:1,sentAt:new Date("2026-09-10T07:30:00.000Z"),idempotencyKey:`eug-staff-inapp-${i+1}`},
        });
      }
      for (let i=0;i<Math.min(8,guardianUsers.length);i++) {
        const child=students[i], g=guardianUsers[i];
        await tx.message.upsert({
          where:{schoolId_idempotencyKey:{schoolId,idempotencyKey:`eug-alert-${i+1}`}},
          update:{status:i%4===0?"queued":"sent",body:`Synthetic attendance notice: ${child.name} has an attendance item requiring guardian review.`,recipientId:g.id,recipientPhone:g.phone||""},
          create:{schoolId,channel:"sms",recipientType:"guardian",recipientId:g.id,recipientPhone:g.phone||"",body:`Synthetic attendance notice: ${child.name} has an attendance item requiring guardian review.`,templateKey:"attendance_late",templateVariables:{studentId:child.id,studentName:child.name,fixture:true},status:i%4===0?"queued":"sent",attempts:i%4===0?0:1,sentAt:i%4===0?null:new Date("2026-09-10T08:15:00.000Z"),idempotencyKey:`eug-alert-${i+1}`},
        });
      }

      // Library: actual PDF resources are served by the app's safe /library-files/demo path.
      const digitalResources=[
        ["EUG-PDF-001","Eugene Academy Family Handbook","Eugene Academy","School Handbook","handbook","/library-files/demo/eugene-academy-handbook.pdf",true,35],
        ["EUG-PDF-002","ICT Laboratory Safety Guide","Academic Department","Computing","study_guide","/library-files/demo/ict-lab-safety.pdf",false,18],
        ["EUG-PDF-003","JHS Mathematics Revision Pack","Mathematics Department","Mathematics","past_paper","/library-files/demo/jhs-mathematics-revision.pdf",true,45],
        ["EUG-PDF-004","PTA Family Partnership Guide","School Leadership","Family","guide","/library-files/demo/pta-family-guide.pdf",false,20],
      ];
      const digitalBooks=[];
      for (let i=0;i<digitalResources.length;i++) {
        const [isbn,title,author,category,materialType,fileUrl,downloadAllowed,estimatedMinutes]=digitalResources[i];
        const bookId=id("eug-library",i+1);
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryBook" ("id","schoolId","isbn","title","author","category","copies","availableCopies","materialType","fileUrl","description","publisher","publishedYear","language","tags","accessibility","readerEnabled","downloadAllowed","visibility","audience","rightsNote","estimatedMinutes","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,3,3,$7,$8,$9,$10,2026,'English',$11::jsonb,$12::jsonb,true,$13,'school',$14::jsonb,$15,$16,NOW(),NOW())
           ON CONFLICT ("schoolId","isbn") DO UPDATE SET "title"=EXCLUDED."title","author"=EXCLUDED."author","category"=EXCLUDED."category","materialType"=EXCLUDED."materialType","fileUrl"=EXCLUDED."fileUrl","description"=EXCLUDED."description","readerEnabled"=true,"downloadAllowed"=EXCLUDED."downloadAllowed","visibility"='school',"estimatedMinutes"=EXCLUDED."estimatedMinutes","updatedAt"=NOW()`,
          bookId,schoolId,isbn,title,author,category,materialType,fileUrl,`${title} is a synthetic Eugene Academy resource created for end-to-end library testing.`,SCHOOL_NAME,
          JSON.stringify(["Eugene Academy","2026/2027",category]),JSON.stringify({screenReaderFriendly:true,largeText:true}),downloadAllowed,
          JSON.stringify({classes:classes.slice(0,3).map(c=>c.id)}),"Synthetic test material. Safe for staging/demo use.",estimatedMinutes,
        );
        const row=await tx.$queryRawUnsafe(`SELECT "id" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "isbn"=$2 LIMIT 1`,schoolId,isbn);
        digitalBooks.push({id:row[0].id,title});
        for (let copy=1;copy<=3;copy++) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "P3LibraryCopy" ("id","schoolId","bookId","accessionNo","barcode","shelfLocation","condition","status","acquiredAt","notes","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,'new','available',$7,'Synthetic trial copy',NOW(),NOW())
             ON CONFLICT ("schoolId","accessionNo") DO UPDATE SET "bookId"=EXCLUDED."bookId","status"='available',"updatedAt"=NOW()`,
            id("eug-copy",`${i+1}-${copy}`),schoolId,row[0].id,`EUG-ACC-${i+1}${copy}`,`EUG-BC-${i+1}${copy}`,`Digital/Reference ${i+1}`,date("2026-09-01"),
          );
        }
      }
      for (let i=0;i<Math.min(12,students.length);i++) {
        const book=digitalBooks[i%digitalBooks.length];
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryReadingProgress" ("id","schoolId","bookId","studentId","progressPercent","lastPage","totalPages","lastPosition","lastOpenedAt","completedAt","updatedBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,12,$7,$8,$9,$10,NOW(),NOW())
           ON CONFLICT ("schoolId","bookId","studentId") DO UPDATE SET "progressPercent"=EXCLUDED."progressPercent","lastPage"=EXCLUDED."lastPage","lastPosition"=EXCLUDED."lastPosition","lastOpenedAt"=EXCLUDED."lastOpenedAt","completedAt"=EXCLUDED."completedAt","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`,
          id("eug-read",i+1),schoolId,book.id,students[i].id,i%4===0?100:25+(i*5)%70,2+(i%8),`page:${2+(i%8)}`,new Date("2026-09-10T10:00:00.000Z"),i%4===0?new Date("2026-09-10T10:30:00.000Z"):null,owner.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryFavourite" ("id","schoolId","bookId","studentId","createdBy","createdAt")
           VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT ("schoolId","bookId","studentId") DO NOTHING`,
          id("eug-fav",i+1),schoolId,book.id,students[i].id,owner.id,
        );
        if (i<6) await tx.$executeRawUnsafe(
          `INSERT INTO "P3LibraryResourceAssignment" ("id","schoolId","bookId","classId","studentId","subjectId","kind","note","dueAt","createdBy","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT ("id") DO UPDATE SET "kind"=EXCLUDED."kind","note"=EXCLUDED."note","dueAt"=EXCLUDED."dueAt"`,
          id("eug-libassign",i+1),schoolId,book.id,students[i].classId,i%2===0?students[i].id:null,subjects[i%subjects.length].id,i%2===0?"required":"recommended","Read before the next class discussion.",date("2026-09-18"),owner.id,
        );
      }

      // Payroll for the expanded staff roster, with real downloadable PDF bytes.
      const payroll=await tx.payrollRun.upsert({
        where:{schoolId_period:{schoolId,period:"2026-08"}},
        update:{status:"paid",processedAt:date("2026-08-31"),paidAt:date("2026-09-02")},
        create:{schoolId,period:"2026-08",status:"paid",processedAt:date("2026-08-31"),paidAt:date("2026-09-02")},
      });
      for (let i=0;i<allStaff.length;i++) {
        const gross=4500+(i%6)*350, deductions={ssnit:Math.round(gross*.055),tax:Math.round(gross*.08),welfare:50};
        const totalDed=Object.values(deductions).reduce((a,b)=>a+b,0), net=gross-totalDed;
        await tx.salaryStructure.upsert({where:{schoolId_staffId:{schoolId,staffId:allStaff[i].id}},update:{grossSalary:new Prisma.Decimal(gross),deductions},create:{schoolId,staffId:allStaff[i].id,grossSalary:new Prisma.Decimal(gross),deductions}});
        const pdf=await makePdf("STAFF PAYSLIP","Payroll period: August 2026",[
          `Staff: ${allStaff[i].name}`,`Email: ${allStaff[i].email || "No email"}`,`Gross salary: GHS ${gross.toFixed(2)}`,`Deductions: GHS ${totalDed.toFixed(2)}`,`Net salary: GHS ${net.toFixed(2)}`,"Status: PAID","This is synthetic payroll data for SukuuNova end-to-end testing."
        ]);
        await tx.payslip.upsert({
          where:{schoolId_payrollRunId_staffId:{schoolId,payrollRunId:payroll.id,staffId:allStaff[i].id}},
          update:{gross:new Prisma.Decimal(gross),deductions,net:new Prisma.Decimal(net),pdfData:pdf},
          create:{schoolId,payrollRunId:payroll.id,staffId:allStaff[i].id,gross:new Prisma.Decimal(gross),deductions,net:new Prisma.Decimal(net),pdfData:pdf},
        });
      }

      // Approved historical report cards with actual PDF data.
      const pastYear=await tx.academicYear.findUnique({where:{schoolId_name:{schoolId,name:"2025/2026"}}});
      const pastTerm=pastYear ? await tx.term.findUnique({where:{schoolId_academicYearId_name:{schoolId,academicYearId:pastYear.id,name:"Term 3"}}}) : null;
      let reportPdfCount=0;
      if (pastTerm) {
        const template=await tx.reportCardTemplate.upsert({
          where:{id:"eug-report-template-2026"},
          update:{schoolId,name:"Eugene Academy Standard Report Card",layoutConfig:{version:2,sections:["identity","subjects","attendance","remarks","approval"],brand:SCHOOL_NAME}},
          create:{id:"eug-report-template-2026",schoolId,name:"Eugene Academy Standard Report Card",layoutConfig:{version:2,sections:["identity","subjects","attendance","remarks","approval"],brand:SCHOOL_NAME}},
        });
        await tx.schoolSettings.update({where:{schoolId},data:{reportCardTemplateId:template.id}});
        for (let i=0;i<Math.min(12,students.length);i++) {
          const student=students[i];
          const scores=await tx.score.findMany({where:{schoolId,studentId:student.id,assessment:{termId:pastTerm.id}},include:{subject:true,assessment:true},take:12});
          const lines=scores.slice(0,10).map(row=>`${row.subject.name} · ${row.assessment.name}: ${Number(row.value).toFixed(1)}`);
          const pdf=await makePdf("OFFICIAL STUDENT REPORT CARD","Term 3 · 2025/2026",[
            `Student: ${student.name}`,`Admission number: ${student.admissionNo}`,`Class: ${classes.find(c=>c.id===student.classId)?.name || "—"}`,...lines,
            i%3===0?"Head remark: Excellent effort and responsible participation.":"Head remark: Good progress. Continue consistent study habits.","Approved by school leadership.","Synthetic report generated for the SukuuNova trial."
          ]);
          await tx.reportCard.upsert({
            where:{studentId_termId:{studentId:student.id,termId:pastTerm.id}},
            update:{templateId:template.id,pdfData:pdf,status:"approved",submittedBy:classTeacherUsers[i%classTeacherUsers.length].id,submittedAt:date("2026-07-27"),approvedBy:principal.id,approvedAt:date("2026-07-29"),sentAt:date("2026-07-30"),remarks:"Consistent effort across the term.",headRemark:"Promoted with encouragement to keep improving.",calculationSnapshot:{fixture:true,academicYear:"2025/2026",term:"Term 3"},calculationVersion:1},
            create:{schoolId,studentId:student.id,termId:pastTerm.id,templateId:template.id,pdfData:pdf,status:"approved",submittedBy:classTeacherUsers[i%classTeacherUsers.length].id,submittedAt:date("2026-07-27"),approvedBy:principal.id,approvedAt:date("2026-07-29"),sentAt:date("2026-07-30"),remarks:"Consistent effort across the term.",headRemark:"Promoted with encouragement to keep improving.",calculationSnapshot:{fixture:true,academicYear:"2025/2026",term:"Term 3"},calculationVersion:1},
          });
          reportPdfCount++;
        }
      }

      // Student/guardian-facing learning arcade history.
      for (let i=0;i<Math.min(20,students.length);i++) {
        await tx.arcadeRound.upsert({
          where:{id:id("eug-arcade",i+1)},
          update:{game:i%2===0?"math_sprint":"word_builder",difficulty:1+(i%3),questions:[{q:"Synthetic practice item",options:["A","B","C","D"],correct:1}],answers:[1],status:"completed",correct:1,xp:20+(i%4)*5,stars:1+(i%3),completedAt:new Date("2026-09-10T12:00:00.000Z"),localDate:"2026-09-10"},
          create:{id:id("eug-arcade",i+1),schoolId,studentId:students[i].id,game:i%2===0?"math_sprint":"word_builder",difficulty:1+(i%3),questions:[{q:"Synthetic practice item",options:["A","B","C","D"],correct:1}],answers:[1],status:"completed",correct:1,xp:20+(i%4)*5,stars:1+(i%3),completedAt:new Date("2026-09-10T12:00:00.000Z"),localDate:"2026-09-10"},
        });
      }

      // Risk flags and staff attendance make leadership/analytics views non-empty.
      for (let i=0;i<10;i++) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "StudentRiskFlag" ("id","schoolId","studentId","reason","detail","flaggedAt","resolvedAt","severity","expiresAt","reviewStatus","assignedTo","resolution")
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT ("id") DO UPDATE SET "detail"=EXCLUDED."detail","resolvedAt"=EXCLUDED."resolvedAt","severity"=EXCLUDED."severity","reviewStatus"=EXCLUDED."reviewStatus","resolution"=EXCLUDED."resolution"`,
          id("eug-risk",i+1),schoolId,students[i].id,i%2===0?"attendance_pattern":"academic_support",
          JSON.stringify({fixture:true,summary:i%2===0?"Repeated lateness pattern for review.":"Early-term score pattern needs teacher follow-up."}),
          date("2026-09-09"),i<3?date("2026-09-10"):null,i%4===0?"HIGH":"MEDIUM",date("2026-10-10"),i<3?"RESOLVED":"OPEN",reviewer.id,i<3?"Reviewed and family/teacher follow-up recorded.":null,
        );
      }
      for (let i=0;i<allStaff.length;i++) {
        await tx.attendanceEvent.upsert({
          where:{id:id("eug-staff-att",i+1)},
          update:{schoolId,staffId:allStaff[i].id,type:"in",method:i%5===0?"fingerprint":"manual",timestamp:new Date(`2026-09-10T07:${String(20+(i%30)).padStart(2,"0")}:00.000Z`),attendanceDate:date("2026-09-10"),isLate:i%11===0,recordedBy:owner.id},
          create:{id:id("eug-staff-att",i+1),schoolId,staffId:allStaff[i].id,type:"in",method:i%5===0?"fingerprint":"manual",timestamp:new Date(`2026-09-10T07:${String(20+(i%30)).padStart(2,"0")}:00.000Z`),attendanceDate:date("2026-09-10"),isLate:i%11===0,recordedBy:owner.id},
        });
      }

      await tx.auditLogSchool.create({
        data:{schoolId,actorId:owner.id,action:"eugene_academy.fixture_completed",entityType:"School",entityId:schoolId,after:{
          synthetic:true,academicYear:"2026/2027",students:students.length,guardians:guardians.length,staff:allStaff.length,classes:classes.length,subjects:subjects.length,
          fullTimetableSlots:classes.length*5*8,lessonPlans:lessonTitles.length,homework:homeworkTitles.length,digitalPdfResources:digitalBooks.length,reportPdfCount
        }},
      });

      const counts = {
        students: students.length,
        guardians: await tx.guardian.count({ where: { schoolId } }),
        staff: allStaff.length,
        classes: classes.length,
        subjects: subjects.length,
        academicYears: await tx.academicYear.count({ where: { schoolId } }),
        terms: await tx.term.count({ where: { schoolId } }),
        calendarEvents: await tx.calendarEvent.count({ where: { schoolId } }),
        timetableSlots: await tx.timetableSlot.count({ where: { schoolId } }),
        assessments: await tx.assessment.count({ where: { schoolId } }),
        scores: await tx.score.count({ where: { schoolId } }),
        invoices: await tx.invoice.count({ where: { schoolId } }),
        payments: await tx.payment.count({ where: { schoolId } }),
        reportCards: await tx.reportCard.count({ where: { schoolId } }),
        payslips: await tx.payslip.count({ where: { schoolId } }),
        inAppMessages: await tx.message.count({ where: { schoolId, channel: "in_app" } }),
        devices: await tx.device.count({ where: { schoolId } }),
        identityCards: await tx.identityCard.count({ where: { schoolId } }),
        arcadeRounds: await tx.arcadeRound.count({ where: { schoolId } }),
        lessonPlans: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "LessonPlan" WHERE "schoolId"=$1`,schoolId))[0].count),
        homework: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "Homework" WHERE "schoolId"=$1`,schoolId))[0].count),
        academicNotes: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "TeacherAcademicNote" WHERE "schoolId"=$1`,schoolId))[0].count),
        academicWorks: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "TeacherAcademicWork" WHERE "schoolId"=$1`,schoolId))[0].count),
        libraryTitles: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "P3LibraryBook" WHERE "schoolId"=$1`,schoolId))[0].count),
        feedingMenus: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "P3FeedingMenu" WHERE "schoolId"=$1`,schoolId))[0].count),
        transportEvents: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "P3BoardingEvent" WHERE "schoolId"=$1`,schoolId))[0].count),
        admissionsEnquiries: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "AdmissionEnquiry" WHERE "schoolId"=$1`,schoolId))[0].count),
        enrolments: Number((await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "Enrollment" WHERE "schoolId"=$1`,schoolId))[0].count),
        reportPdfCount,
      };
      return counts;
    }, { maxWait: 15000, timeout: 300000 });

    const accounts = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
      return tx.$queryRawUnsafe(
        `SELECT r."name" AS "role",u."name",u."email"
         FROM "User" u
         JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
         JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
         WHERE u."schoolId"=$1 AND u."email" IS NOT NULL
         ORDER BY r."name",u."email"`,
        schoolId,
      );
    });

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "eugene-academy-account-matrix.json"), JSON.stringify({
      school:{name:SCHOOL_NAME,code:SCHOOL_CODE},
      ownerEmail:OWNER_EMAIL,
      passwordVariable:"EUGENE_ACADEMY_TEST_PASSWORD",
      note:"The shared test password is intentionally not written to this artifact or logs.",
      accounts,
    }, null, 2));
    fs.writeFileSync(path.join(ARTIFACT_DIR, "eugene-academy-coverage.json"), JSON.stringify({
      generatedAt:new Date().toISOString(),
      school:{name:SCHOOL_NAME,code:SCHOOL_CODE},
      coverage,
      testJourneys:[
        "Platform Owner -> school network -> School 360",
        "School Owner / Principal -> people, academics, attendance, finance, communications and operations",
        "Class / Subject Teacher -> timetable, learners, homework, gradebook, lesson planning and messages",
        "Academic Coordinator / Department Head -> lesson and homework review, gradebook/readiness",
        "Accountant -> fees, invoices, payments, adjustments, feeding and payroll",
        "HR -> staff, staff attendance, payroll and recruitment",
        "Transport Officer -> routes, locations, boarding history and device-adjacent operations",
        "Front Desk / Gate Security -> visitors, attendance and pickup",
        "Admissions Officer -> enquiry pipeline and enrolment",
        "Guardian -> linked children, academics, library, transport, fees, messages and arcade",
        "Student-role account -> generic role/access smoke test (no dedicated /student universe currently exists)",
      ],
      nonClaims:[
        "Synthetic portraits are local generated PNG avatars; no real person's face is used.",
        "No AWS face enrollment, SMS provider, WhatsApp provider or external device enrollment is invoked.",
        "Queued/sent communication records are synthetic workflow fixtures, not claims of real provider delivery.",
      ],
    }, null, 2));

    console.log(JSON.stringify({
      ok:true,
      school:{name:SCHOOL_NAME,code:SCHOOL_CODE},
      ownerEmail:OWNER_EMAIL,
      passwordVariable:"EUGENE_ACADEMY_TEST_PASSWORD",
      accountMatrix:"test-artifacts/eugene-academy-account-matrix.json",
      coverageReport:"test-artifacts/eugene-academy-coverage.json",
      coverage,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[eugene-academy] seed failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
