#!/usr/bin/env node
/*
 * Eugene Academy full-system staging fixture.
 *
 * This intentionally refuses to run against DATABASE_URL. Point
 * TEST_DATABASE_URL at a separate Railway/Postgres staging database.
 *
 * Required:
 *   ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES
 *   TEST_DATABASE_URL=<separate staging database>
 *   EUGENE_ACADEMY_TEST_PASSWORD=<12+ char trial password>
 * Optional:
 *   EUGENE_ACADEMY_OWNER_NAME=Eugene Academy Owner
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.EUGENE_ACADEMY_TEST_PASSWORD || "");
const ownerName = String(process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner").trim();

if (allow !== "YES") throw new Error("Refusing seed: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing seed: TEST_DATABASE_URL must be different from DATABASE_URL.");
if (password.length < 12) throw new Error("EUGENE_ACADEMY_TEST_PASSWORD must be at least 12 characters.");

const child = spawnSync(process.execPath, [path.join(__dirname, "seed-realistic-test-school.cjs")], {
  stdio: "inherit",
  env: {
    ...process.env,
    TEST_DATABASE_URL: testUrl,
    TEST_SCHOOL_CODE: "eug123",
    TEST_SCHOOL_NAME: "Eugene Academy",
    TEST_SEED_PASSWORD: password,
  },
});
if (child.status !== 0) process.exit(child.status || 1);

process.env.DATABASE_URL = testUrl;
const prisma = new PrismaClient();

function avatar(kind, index) {
  return `https://api.dicebear.com/9.x/personas/png?size=96&seed=${encodeURIComponent(`eug-${kind}-${index}`)}`;
}

async function main() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
  if (!school) throw new Error("Eugene Academy was not created.");
  const schoolId = school.id;
  const passwordHash = await hash(password, 12);

  const originalOwner = await prisma.user.findFirst({
    where: { schoolId, userRoles: { some: { role: { name: "Owner" } } } },
  });
  if (!originalOwner) throw new Error("Owner account was not created.");
  await prisma.user.update({
    where: { id: originalOwner.id },
    data: {
      name: ownerName,
      email: "eugeneacademy@gmail.com",
      passwordHash,
      status: "active",
      needsPasswordChange: false,
    },
  });

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { admissionNo: "asc" } });
  for (let i = 0; i < students.length; i++) {
    await prisma.student.update({ where: { id: students[i].id }, data: { photoUrl: avatar("student", i + 1) } });
  }

  const staff = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT u."id" FROM "User" u
     JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
     JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
     WHERE u."schoolId"=$1 AND r."name" NOT IN ('Parent','Student')`,
    schoolId,
  );
  for (let i = 0; i < staff.length; i++) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`,
      schoolId,
      staff[i].id,
      avatar("staff", i + 1),
    ).catch(() => {});
  }

  const studentRole = await prisma.role.findFirst({ where: { schoolId, name: "Student" } });
  if (studentRole) {
    for (let i = 0; i < Math.min(12, students.length); i++) {
      const email = `student${i + 1}.eug123@test.sukuunova.local`;
      const account = await prisma.user.upsert({
        where: { schoolId_email: { schoolId, email } },
        update: { name: `${students[i].name} Portal`, passwordHash, status: "active", needsPasswordChange: false },
        create: { schoolId, name: `${students[i].name} Portal`, email, passwordHash, status: "active", needsPasswordChange: false },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: account.id, roleId: studentRole.id } },
        update: { schoolId },
        create: { schoolId, userId: account.id, roleId: studentRole.id },
      });
    }
  }

  await prisma.schoolSettings.update({
    where: { schoolId },
    data: {
      timezone: "Africa/Accra",
      attendanceGraceMinutes: 10,
      notificationChannels: { in_app: true, email: true, sms: false, whatsapp: false },
      timetableConfig: { schoolDays: [1, 2, 3, 4, 5], periodsPerDay: 8, firstPeriod: "08:00", periodMinutes: 45 },
      assessmentConfig: { caWeight: 40, examWeight: 60, requireModeration: true },
      reportCardConfig: { showStudentPhoto: true, showOverallPosition: true, verifiedWorkflow: true },
    },
  });

  const accounts = await prisma.$queryRawUnsafe(
    `SELECT r."name" AS "role",u."name",u."email"
     FROM "User" u
     JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId"
     JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=u."schoolId"
     WHERE u."schoolId"=$1 ORDER BY r."name",u."email"`,
    schoolId,
  );
  fs.mkdirSync(path.resolve("test-artifacts"), { recursive: true });
  fs.writeFileSync(
    path.resolve("test-artifacts/eugene-academy-account-matrix.json"),
    JSON.stringify({ school: { name: school.name, code: school.uniqueCode }, passwordVariable: "EUGENE_ACADEMY_TEST_PASSWORD", accounts }, null, 2),
  );

  console.log(JSON.stringify({
    school: { name: school.name, code: school.uniqueCode },
    ownerEmail: "eugeneacademy@gmail.com",
    studentsWithSyntheticPortraits: students.length,
    staffWithSyntheticPortraits: staff.length,
    studentJourneyAccounts: Math.min(12, students.length),
    accountMatrix: "test-artifacts/eugene-academy-account-matrix.json",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
