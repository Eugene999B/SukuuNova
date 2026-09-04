#!/usr/bin/env node
/*
 * One-shot Eugene Academy owner credential repair.
 *
 * This intentionally does NOT run the large Eugene fixture at startup. That
 * fixture is useful for test-data generation but is too fragile to use as a
 * production credential repair because unrelated schema drift can prevent the
 * owner password update from ever being reached.
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const SEED_REVISION = "2026-09-04-eugene-owner-r9";
const prisma = new PrismaClient();

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();
const ownerEmail = String(process.env.EUGENE_ACADEMY_OWNER_EMAIL || "").trim().toLowerCase();
const ownerPassword = String(process.env.EUGENE_ACADEMY_OWNER_PASSWORD || "");
const ownerName = String(process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Academy Owner").trim();

if (allow !== "YES") throw new Error("Refusing Eugene Academy owner repair: explicit enable flag is required.");
if (code !== "eug123") throw new Error("Refusing Eugene Academy owner repair: TEST_SCHOOL_CODE must be eug123.");
if (!ownerEmail || !ownerPassword) throw new Error("Eugene Academy owner email and password are required through Railway variables.");

async function hasCompleted() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
  if (!school) return false;
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId: school.id } });
  const config = settings && settings.reportCardConfig;
  return Boolean(config && typeof config === "object" && config.eugeneOwnerRepairRevision === SEED_REVISION);
}

async function markCompleted(schoolId) {
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  if (!settings) throw new Error("Eugene Academy school settings record was not found.");
  const existing = settings.reportCardConfig;
  const config = existing && typeof existing === "object" ? existing : {};
  await prisma.schoolSettings.update({
    where: { schoolId },
    data: { reportCardConfig: { ...config, eugeneOwnerRepairRevision: SEED_REVISION } },
  });
}

async function repairOwner() {
  if (await hasCompleted()) {
    console.log(`[eugene-academy-trial] owner repair ${SEED_REVISION} already completed; skipping`);
    return;
  }

  const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
  if (!school) throw new Error("Eugene Academy (eug123) was not found.");

  const owner = await prisma.user.findFirst({
    where: { schoolId: school.id, email: ownerEmail },
    select: { id: true, email: true, name: true },
  });
  if (!owner) throw new Error(`Eugene Academy owner account ${ownerEmail} was not found.`);

  const passwordHash = await hash(ownerPassword, 12);
  await prisma.user.update({
    where: { id: owner.id },
    data: {
      name: ownerName || owner.name,
      passwordHash,
      status: "active",
      needsPasswordChange: false,
    },
  });

  await markCompleted(school.id);
  console.log(`[eugene-academy-trial] owner credential repair ${SEED_REVISION} completed`);
}

repairOwner()
  .catch((err) => {
    console.error("[eugene-academy-trial] owner repair failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
