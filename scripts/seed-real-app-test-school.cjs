#!/usr/bin/env node
/*
 * One-shot seed wrapper for the LIVE SukuuNova application database.
 *
 * SAFETY:
 * - This wrapper may only run with ALLOW_REAL_APP_TEST_SEED=YES.
 * - It requires a synthetic test school code beginning with "sn-live-test-".
 * - It derives TEST_DATABASE_URL from the service's existing DATABASE_URL so
 *   the fixture is stored in the real application database as a separate tenant.
 * - It never changes the production application schema or existing tenants.
 *
 * Intended use: a controlled one-shot Railway pre-deploy command, then remove
 * the command immediately after the seed succeeds.
 */

const dbUrl = String(process.env.DATABASE_URL || "").trim();
const allow = String(process.env.ALLOW_REAL_APP_TEST_SEED || "").trim();
const code = String(process.env.TEST_SCHOOL_CODE || "").trim().toLowerCase();

if (!dbUrl) throw new Error("DATABASE_URL is required.");
if (allow !== "YES") {
  throw new Error("REFUSING TO RUN: set ALLOW_REAL_APP_TEST_SEED=YES for this one-shot synthetic tenant seed.");
}
if (!/^sn-live-test-[a-z0-9-]{3,32}$/.test(code)) {
  throw new Error('REFUSING TO RUN: TEST_SCHOOL_CODE must match sn-live-test-<suffix>.');
}

const separator = dbUrl.includes("?") ? "&" : "?";
process.env.TEST_DATABASE_URL = `${dbUrl}${separator}application_name=sukuunova_live_test_seed`;
process.env.TEST_SCHOOL_CODE = code;
process.env.TEST_SCHOOL_NAME = process.env.TEST_SCHOOL_NAME || "SukuuNova Demonstration Academy";

require("./seed-realistic-test-school.cjs");
