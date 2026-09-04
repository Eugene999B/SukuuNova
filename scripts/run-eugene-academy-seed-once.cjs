#!/usr/bin/env node
/*
 * Runs the guarded Eugene Academy live fixture once at application startup.
 * Preparation is intentionally done in this same runtime container because
 * Railway pre-deploy runs in a separate filesystem that is not persisted.
 */
const { spawn } = require("child_process");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const SEED_REVISION = "2026-09-04-eugene-r7";
const prisma = new PrismaClient();

function runScript(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`${file} terminated by ${signal}.`));
      if (code !== 0) return reject(new Error(`${file} exited with code ${code}.`));
      resolve();
    });
  });
}

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

  // These scripts rewrite/prepare the exact runtime fixture and therefore
  // must execute in the same container that will run the seed.
  await runScript("prepare-eugene-academy-trial-fixture.cjs");
  await runScript("prepare-eugene-append-only-fixture.cjs");
  await runScript("prepare-eugene-extension-fixture.cjs");

  console.log(`[eugene-academy-trial] launching guarded seed ${SEED_REVISION}`);
  await runScript("seed-eugene-academy-trial.cjs");
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

// r7 is intentionally a one-time fixture credential refresh; later startups skip once marked complete.
