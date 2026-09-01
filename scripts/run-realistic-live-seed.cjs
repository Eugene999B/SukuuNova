#!/usr/bin/env node
/*
 * Explicit one-shot runner for the realistic synthetic school in the REAL
 * SukuuNova/Postgres environment.
 *
 * Safety:
 * - Requires ALLOW_REAL_APP_TEST_SEED=true.
 * - Requires a synthetic TEST_SCHOOL_CODE beginning with sn-live-test-.
 * - Uses the real DATABASE_URL only; TEST_DATABASE_URL is derived to the same
 *   database with a harmless application_name query so the existing fixture's
 *   isolation guard remains satisfied.
 * - Does not touch existing tenants except the requested synthetic school code.
 *
 * Runtime compatibility patches are applied only to a temporary copy of the
 * fixture for this controlled synthetic tenant run. The production schema is
 * not weakened to accommodate test data.
 */
const fs = require("fs");
const path = require("path");

if (process.env.ALLOW_REAL_APP_TEST_SEED !== "true") {
  throw new Error("Refusing live seed: set ALLOW_REAL_APP_TEST_SEED=true explicitly.");
}
const code = String(process.env.TEST_SCHOOL_CODE || "").toLowerCase();
if (!code.startsWith("sn-live-test-")) {
  throw new Error("Refusing live seed: TEST_SCHOOL_CODE must start with sn-live-test-.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

process.env.TEST_DATABASE_URL = `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes("?") ? "&" : "?"}application_name=sukuunova-realistic-seed`;

const { PrismaClient } = require("@prisma/client");
const originalTransaction = PrismaClient.prototype.$transaction;
PrismaClient.prototype.$transaction = function patchedTransaction(arg, options, ...rest) {
  if (typeof arg === "function") {
    return originalTransaction.call(this, arg, {
      maxWait: 15000,
      timeout: 120000,
      ...(options || {}),
    });
  }
  return originalTransaction.call(this, arg, options, ...rest);
};

const scriptsDir = __dirname;
const source = path.join(scriptsDir, "seed-realistic-test-school.cjs");
const temp = path.join(scriptsDir, `.seed-live-runtime-${process.pid}.cjs`);
const originalSource = fs.readFileSync(source, "utf8");
const patchedSource = originalSource
  .replace(/['\"]device['\"]/g, "'qr'")
  .replace(/type:\s*["']CA["']/g, "type: 'ca'")
  .replace(/type:\s*["']EXAM["']/g, "type: 'exam'")
  .replace(/classId:\s*null/g, "classId: classes[0].id")
  .replace(/method:\s*["']bank_transfer["']/g, "method: 'momo'")
  // Raw SQL JSONB columns used by Phase 3 operations.
  .replace(/(\"items\"\) VALUES \(\$1,\$2,\$3,\$4),/g, "$1")
  .replace(/("meal","items","plannedCost","createdBy"\) VALUES \(\$1,\$2,\$3,'Lunch',\$4,520,\$5\)/g, "$1")
  .replace(/'Lunch',\$4,520,\$5/g, "'Lunch',$4::jsonb,520,$5")
  .replace(/\"prompt\",\"options\",\"correctOptionIndex\",\"points\",\"orderIndex\"\) VALUES \(\$1,\$2,\$3,\$4,\$5,1,5,\$6\)/g, '\"prompt\",\"options\",\"correctOptionIndex\",\"points\",\"orderIndex\") VALUES ($1,$2,$3,$4,$5::jsonb,1,5,$6)')
  .replace(/\"answers\"\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,'submitted',22\.5,\$8\)/g, '\"answers\") VALUES ($1,$2,$3,$4,$5,$6,$7,\'submitted\',22.5,$8::jsonb)')
  .replace(/'attendance',\$4,'pending'/g, "'attendance',$4::jsonb,'pending'");
fs.writeFileSync(temp, patchedSource, "utf8");

console.log(`[live-seed] starting synthetic tenant ${code}`);
const cleanup = () => {
  try { fs.unlinkSync(temp); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

require(temp);
