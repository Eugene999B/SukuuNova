#!/usr/bin/env node
/**
 * One-shot password reset for the dedicated synthetic live test school.
 *
 * Safety:
 * - Requires ALLOW_REAL_APP_TEST_SEED=YES.
 * - Only permits the dedicated sn-test-2026 school code.
 * - Uses the real DATABASE_URL explicitly.
 * - Only updates synthetic fixture users whose email ends with
 *   @test.sukuunova.local; existing real-school accounts are untouched.
 * - Uses the documented synthetic test password so manual test login is deterministic.
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const allow = String(process.env.ALLOW_REAL_APP_TEST_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();
const password = "SukuuTest!2026";
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (allow !== "YES") throw new Error("Refusing test credential reset: ALLOW_REAL_APP_TEST_SEED must be YES.");
if (code !== "sn-test-2026") throw new Error("Refusing test credential reset: TEST_SCHOOL_CODE must be sn-test-2026.");
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

process.env.DATABASE_URL = databaseUrl;
const prisma = new PrismaClient();

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({
    where: { uniqueCode: code },
    select: { schoolId: true, status: true }
  });
  if (!directory) throw new Error(`Test school ${code} does not exist.`);
  if (directory.status !== "active") throw new Error(`Test school ${code} is not active.`);

  const passwordHash = await hash(password, 12);
  const result = await prisma.user.updateMany({
    where: {
      schoolId: directory.schoolId,
      email: { endsWith: "@test.sukuunova.local" }
    },
    data: {
      passwordHash,
      status: "active",
      needsPasswordChange: false
    }
  });

  if (result.count === 0) {
    throw new Error(`No synthetic test users found for ${code}.`);
  }
  console.log(`[test-credential-reset] reset ${result.count} synthetic users for ${code}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
