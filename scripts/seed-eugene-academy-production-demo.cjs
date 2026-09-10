#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ACK = "EUGENE_ACADEMY_ONLY";
const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const OWNER_EMAIL = "eugeneacademy@gmail.com";
const DEMO_PLAN_NAME = "Eugene Academy Demo";

const allow = String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim();
const targetUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.EUGENE_ACADEMY_DEMO_PASSWORD || "");
const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim().toLowerCase();

if (allow !== ACK) {
  throw new Error(`Refusing production demo seed: set ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=${ACK}.`);
}
if (!targetUrl) throw new Error("DATABASE_URL is required for the production demo seed.");
if (railwayEnvironment && railwayEnvironment !== "production") {
  throw new Error(`Refusing production demo seed in Railway environment '${railwayEnvironment}'. Expected 'production'.`);
}
if (password.length < 12) throw new Error("EUGENE_ACADEMY_DEMO_PASSWORD must be at least 12 characters.");

const baseFixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const runnerPath = path.join(__dirname, "run-eugene-academy-trial.cjs");
const originalBase = fs.readFileSync(baseFixturePath, "utf8");
let basePatched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Production demo compatibility guard failed: ${label} changed.`);
  return source.replace(needle, replacement);
}

function patchBaseFixtureForProductionDemo() {
  let base = originalBase;
  base = replaceRequired(
    base,
    'where: { name: "Foundation" },',
    `where: { name: "${DEMO_PLAN_NAME}" },`,
    "subscription plan lookup",
  );
  base = replaceRequired(
    base,
    'create: { name: "Foundation", price: new Prisma.Decimal(0), featureFlags:',
    `create: { name: "${DEMO_PLAN_NAME}", price: new Prisma.Decimal(0), featureFlags:`,
    "subscription plan creation",
  );
  fs.writeFileSync(baseFixturePath, base, "utf8");
  basePatched = true;
}

function restoreBaseFixture() {
  if (!basePatched) return;
  try {
    fs.writeFileSync(baseFixturePath, originalBase, "utf8");
  } catch (error) {
    console.error("[eugene-demo] failed to restore base fixture:", error instanceof Error ? error.message : String(error));
  }
  basePatched = false;
}

async function productionPreflight() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: SCHOOL_CODE } });
    if (!directory) return { existing: false };

    const state = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", directory.schoolId);
      const school = await tx.school.findUnique({ where: { id: directory.schoolId } });
      const owner = await tx.user.findUnique({ where: { schoolId_email: { schoolId: directory.schoolId, email: OWNER_EMAIL } } });
      return { school, owner };
    });

    if (!state.school) throw new Error(`School code ${SCHOOL_CODE} already exists but its tenant row is unavailable.`);
    if (state.school.name !== SCHOOL_NAME) {
      throw new Error(`Refusing to overwrite existing school code ${SCHOOL_CODE}: current name is '${state.school.name}'.`);
    }
    if (!state.owner) {
      throw new Error(`Refusing to refresh ${SCHOOL_CODE}: existing Eugene Academy does not contain the expected owner account.`);
    }
    return { existing: true };
  } finally {
    await prisma.$disconnect();
  }
}

process.on("exit", restoreBaseFixture);
process.on("SIGINT", () => { restoreBaseFixture(); process.exit(130); });
process.on("SIGTERM", () => { restoreBaseFixture(); process.exit(143); });

async function main() {
  const preflight = await productionPreflight();
  patchBaseFixtureForProductionDemo();

  const childEnv = {
    ...process.env,
    DATABASE_URL: "postgresql://production-demo-guard.invalid/sukuunova",
    TEST_DATABASE_URL: targetUrl,
    ALLOW_EUGENE_ACADEMY_TRIAL_SEED: "YES",
    EUGENE_ACADEMY_TEST_PASSWORD: password,
    TEST_STUDENT_COUNT: "225",
    EUGENE_ACADEMY_OWNER_NAME: process.env.EUGENE_ACADEMY_OWNER_NAME || "Eugene Owusu",
    EUGENE_ACADEMY_PRODUCTION_DEMO_MODE: "YES",
  };

  console.log(`[eugene-demo] ${preflight.existing ? "refreshing" : "creating"} permanent production demo tenant ${SCHOOL_CODE}.`);
  console.log("[eugene-demo] external SMS/WhatsApp delivery is not invoked by this fixture; synthetic communication rows remain internal test data.");

  let child;
  try {
    child = spawnSync(process.execPath, [runnerPath], { env: childEnv, stdio: "inherit" });
  } finally {
    restoreBaseFixture();
  }

  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status || 1);
  console.log(`[eugene-demo] ${SCHOOL_NAME} (${SCHOOL_CODE}) is verified in the production database as a permanent synthetic demonstration school.`);
}

main().catch((error) => {
  restoreBaseFixture();
  console.error("[eugene-demo] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
});
