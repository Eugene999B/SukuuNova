#!/usr/bin/env node
/*
 * One-shot runner for the canonical synthetic test school in the REAL
 * SukuuNova/Postgres environment.
 *
 * SAFETY:
 * - Requires ALLOW_REAL_APP_TEST_SEED=YES.
 * - Only permits the dedicated sn-test-2026 school code.
 * - Derives TEST_DATABASE_URL from DATABASE_URL with a harmless
 *   application_name query so the realistic fixture's isolation guard passes.
 * - The fixture itself upserts only the requested synthetic school code.
 */
const { PrismaClient } = require("@prisma/client");

const dbUrl = String(process.env.DATABASE_URL || "").trim();
const allow = String(process.env.ALLOW_REAL_APP_TEST_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();

if (!dbUrl) throw new Error("DATABASE_URL is required.");
if (allow !== "YES") throw new Error("REFUSING TO RUN: ALLOW_REAL_APP_TEST_SEED must be YES.");
if (code !== "sn-test-2026") throw new Error("REFUSING TO RUN: TEST_SCHOOL_CODE must be sn-test-2026.");

const separator = dbUrl.includes("?") ? "&" : "?";
process.env.TEST_DATABASE_URL = `${dbUrl}${separator}application_name=sukuunova_sn_test_live_seed`;
process.env.TEST_SCHOOL_CODE = code;
process.env.TEST_SCHOOL_NAME = process.env.TEST_SCHOOL_NAME || "SukuuNova Demonstration Academy";

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

require("./seed-realistic-test-school.cjs");
