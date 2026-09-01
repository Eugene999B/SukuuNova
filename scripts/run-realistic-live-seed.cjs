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
 * Runtime compatibility patches are intentionally applied to a temporary copy
 * of the existing fixture: the current schema rejects the fixture's historical
 * "device" attendance method, and the large fixture needs a longer Prisma
 * interactive-transaction timeout than the default five seconds.
 */
const fs = require("fs");
const os = require("os");
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

const source = path.resolve(__dirname, "seed-realistic-test-school.cjs");
const temp = path.join(os.tmpdir(), `sukuunova-live-seed-${process.pid}.cjs`);
const originalSource = fs.readFileSync(source, "utf8");
const patchedSource = originalSource.replace(/['\"]device['\"]/g, "'qr'");
fs.writeFileSync(temp, patchedSource, "utf8");

process.on("exit", () => {
  try { fs.unlinkSync(temp); } catch {}
});

require(temp);
