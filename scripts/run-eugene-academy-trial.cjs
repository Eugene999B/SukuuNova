#!/usr/bin/env node
const fs = require("fs");
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
const baseFixturePath = path.join(__dirname, "seed-realistic-test-school.cjs");
const coreFixturePath = path.join(__dirname, "seed-eugene-academy-trial.cjs");
const originals = new Map([
  [baseFixturePath, fs.readFileSync(baseFixturePath, "utf8")],
  [coreFixturePath, fs.readFileSync(coreFixturePath, "utf8")],
]);
const patchedPaths = new Set();

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Fixture compatibility guard failed: ${label} changed.`);
  return source.replace(needle, replacement);
}

function patchFixtures() {
  let base = originals.get(baseFixturePath);
  base = replaceRequired(base, "'in','device'", "'in','fingerprint'", "legacy attendance method");

  const baseFeeNeedle = `        items.push(await tx.feeItem.upsert({
          where: { schoolId_termId_classId_name: { schoolId, termId: term.id, classId: null, name } },
          update: { amount: new Prisma.Decimal(amount) },
          create: { schoolId, name, amount: new Prisma.Decimal(amount), termId: term.id, classId: null }
        }));`;
  const baseFeeReplacement = `        const existingFeeItem = await tx.feeItem.findFirst({ where: { schoolId, termId: term.id, classId: null, name } });
        const feeItem = existingFeeItem
          ? await tx.feeItem.update({ where: { id: existingFeeItem.id }, data: { amount: new Prisma.Decimal(amount) } })
          : await tx.feeItem.create({ data: { schoolId, name, amount: new Prisma.Decimal(amount), termId: term.id, classId: null } });
        items.push(feeItem);`;
  base = replaceRequired(base, baseFeeNeedle, baseFeeReplacement, "base nullable fee-item write");
  fs.writeFileSync(baseFixturePath, base, "utf8");
  patchedPaths.add(baseFixturePath);

  let core = originals.get(coreFixturePath);
  const coreFeeNeedle = `      for (const [name,amount] of feeDefs) feeItems.push(await tx.feeItem.upsert({
        where:{schoolId_termId_classId_name:{schoolId,termId:currentTerm.id,classId:null,name}},
        update:{amount:new Prisma.Decimal(amount)},
        create:{schoolId,termId:currentTerm.id,classId:null,name,amount:new Prisma.Decimal(amount)},
      }));`;
  const coreFeeReplacement = `      for (const [name,amount] of feeDefs) {
        const existingFeeItem=await tx.feeItem.findFirst({where:{schoolId,termId:currentTerm.id,classId:null,name}});
        const feeItem=existingFeeItem
          ? await tx.feeItem.update({where:{id:existingFeeItem.id},data:{amount:new Prisma.Decimal(amount)}})
          : await tx.feeItem.create({data:{schoolId,termId:currentTerm.id,classId:null,name,amount:new Prisma.Decimal(amount)}});
        feeItems.push(feeItem);
      }`;
  core = replaceRequired(core, coreFeeNeedle, coreFeeReplacement, "current-term nullable fee-item write");
  fs.writeFileSync(coreFixturePath, core, "utf8");
  patchedPaths.add(coreFixturePath);

  console.log("[eugene-academy] applied guarded compatibility normalization for current schema.");
}

function restoreFixtures() {
  for (const fixturePath of patchedPaths) {
    try { fs.writeFileSync(fixturePath, originals.get(fixturePath), "utf8"); } catch (error) {
      console.error("[eugene-academy] failed to restore fixture file:", error instanceof Error ? error.message : String(error));
    }
  }
  patchedPaths.clear();
}

process.on("exit", restoreFixtures);
process.on("SIGINT", () => { restoreFixtures(); process.exit(130); });
process.on("SIGTERM", () => { restoreFixtures(); process.exit(143); });

patchFixtures();

const steps = [
  ["core school fixture", "seed-eugene-academy-trial.cjs"],
  ["operational depth", "seed-eugene-academy-operations.cjs"],
  ["coverage verification", "verify-eugene-academy-trial.cjs"],
];

for (const [label, filename] of steps) {
  console.log(`[eugene-academy] starting ${label}…`);
  const child = spawnSync(process.execPath, [path.join(__dirname, filename)], { env, stdio: "inherit" });
  if (child.error) {
    restoreFixtures();
    throw child.error;
  }
  if (child.status !== 0) {
    console.error(`[eugene-academy] ${label} failed.`);
    restoreFixtures();
    process.exit(child.status || 1);
  }
  console.log(`[eugene-academy] ${label} complete.`);
}

restoreFixtures();
console.log("[eugene-academy] full synthetic staging fixture verified successfully.");
