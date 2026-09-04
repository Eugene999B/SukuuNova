#!/usr/bin/env node
/*
 * Runs the guarded Eugene Academy live fixture once at application startup.
 * The seed itself remains fail-closed and idempotent. A completion marker is
 * stored in SchoolSettings so routine app restarts do not rerun the fixture.
 */
const { spawn } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const SEED_REVISION = "2026-09-04-eugene-r5";
const prisma = new PrismaClient();

async function hasCompleted() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
  if (!school) return false;
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId: school.id } });
  const config = settings && settings.reportCardConfig;
  return Boolean(config && typeof config === "object" && config.eugeneSeedRevision === SEED_REVISION);
}

async function markCompleted() {
  const school = await prisma.school.findUnique({ where: { uniqueCode: "eug123" } });
  if (!school) throw new Error("Eugene Academy seed completed but tenant could not be found for completion marking.");
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId: school.id } });
  const existing = settings && settings.reportCardConfig;
  const config = existing && typeof existing === "object" ? existing : {};
  await prisma.schoolSettings.update({
    where: { schoolId: school.id },
    data: { reportCardConfig: { ...config, eugeneSeedRevision: SEED_REVISION } },
  });
}

async function run() {
  if (await hasCompleted()) {
    console.log(`[eugene-academy-trial] seed ${SEED_REVISION} already completed; skipping`);
    return;
  }

  console.log(`[eugene-academy-trial] launching guarded seed ${SEED_REVISION}`);
  const child = spawn(process.execPath, [require("path").join(__dirname, "seed-eugene-academy-trial.cjs")], {
    stdio: "inherit",
    env: process.env,
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 143 : (code == null ? 1 : code)));
  });

  if (exitCode !== 0) throw new Error(`Eugene Academy seed exited with code ${exitCode}.`);
  await markCompleted();
  console.log(`[eugene-academy-trial] seed ${SEED_REVISION} completed`);
}

run()
  .catch((err) => {
    console.error("[eugene-academy-trial] startup seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
