#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim();
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.EUGENE_ACADEMY_TEST_PASSWORD || "");
if (allow !== "YES") throw new Error("Refusing Eugene Academy trial fixture: set ALLOW_EUGENE_ACADEMY_TRIAL_SEED=YES.");
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
if (productionUrl && productionUrl === testUrl) throw new Error("Refusing Eugene Academy trial fixture: TEST_DATABASE_URL must be different from DATABASE_URL.");
if (password.length < 12) throw new Error("EUGENE_ACADEMY_TEST_PASSWORD must be at least 12 characters.");

const studentCount = Number(process.env.TEST_STUDENT_COUNT || 225);
if (!Number.isInteger(studentCount) || studentCount < 225 || studentCount > 500) {
  throw new Error("TEST_STUDENT_COUNT must be an integer between 225 and 500 for the Eugene Academy full-system trial.");
}

const env = { ...process.env, TEST_STUDENT_COUNT: String(studentCount) };
const steps = [
  ["core school fixture", "seed-eugene-academy-trial.cjs"],
  ["operational depth", "seed-eugene-academy-operations.cjs"],
  ["coverage verification", "verify-eugene-academy-trial.cjs"],
];

for (const [label, filename] of steps) {
  console.log(`[eugene-academy] starting ${label}…`);
  const child = spawnSync(process.execPath, [path.join(__dirname, filename)], {
    env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    console.error(`[eugene-academy] ${label} failed.`);
    process.exit(child.status || 1);
  }
  console.log(`[eugene-academy] ${label} complete.`);
}

console.log("[eugene-academy] full synthetic staging fixture verified successfully.");
