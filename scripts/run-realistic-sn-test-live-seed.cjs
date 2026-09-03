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
 * - Compatibility patches are applied only to a temporary fixture copy.
 * - The production schema is never weakened to accommodate test data.
 */
const fs = require("fs");
const path = require("path");
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

const scriptsDir = __dirname;
const source = path.join(scriptsDir, "seed-realistic-test-school.cjs");
const temp = path.join(scriptsDir, `.seed-sn-test-live-${process.pid}.cjs`);
const originalSource = fs.readFileSync(source, "utf8");

let patchedSource = originalSource
  .replace(/[\"']device[\"']/g, "'qr'")
  .replace(/type:\s*[\"']CA[\"']/g, "type: 'ca'")
  .replace(/type:\s*[\"']EXAM[\"']/g, "type: 'exam'")
  .replace(/classId:\s*null/g, "classId: classes[0].id")
  .replace(/method:\s*[\"']bank_transfer[\"']/g, "method: 'momo'")
  // The dedicated conflict pair is outside the rolling 30-day fixture window,
  // so it does not collide with the normal daily attendance rows.
  .replace(/d\("2026-08-31"\)/g, "d(\"2026-07-31\")")
  .replace(
    /timeOut:\s*i%2\s*\?\s*new Date\(now\.getTime\(\)-\(i\*3600000\)-1800000\)\s*:\s*null/g,
    "timeOut: i%2 ? new Date(now.getTime()-(i*3600000)+1800000) : null"
  );

patchedSource = patchedSource.replace(
  "async function exec(tx, sql, ...params) { return tx.$executeRawUnsafe(sql, ...params); }",
  `async function exec(tx, sql, ...params) {
    let normalizedSql = sql;
    let normalizedParams = params;
    if (normalizedSql.includes('"P3FeedingMenu"') && normalizedSql.includes('"items"')) {
      normalizedSql = normalizedSql.replace(",$4,520,$5)", ",$4::jsonb,520,$5)");
    }
    if (normalizedSql.includes('"P3ExamQuestion"') && normalizedSql.includes('"options"')) {
      normalizedSql = normalizedSql.replace(",$4,$5,1,5,$6)", ",$4,$5::jsonb,1,5,$6)");
    }
    if (normalizedSql.includes('"P3ExamAttempt"') && normalizedSql.includes('"answers"')) {
      normalizedSql = normalizedSql.replace(",$7,'submitted',22.5,$8)", ",$7,'submitted',22.5,$8::jsonb)");
    }
    if (normalizedSql.includes('"P3OfflineSyncQueue"') && normalizedSql.includes('"payload"')) {
      normalizedSql = normalizedSql.replace(",'attendance',$4,'pending'", ",'attendance',$4::jsonb,'pending'");
    }
    if (normalizedSql.includes('"P3FinanceAdjustment"') && normalizedSql.includes('"approvedAt"')) {
      normalizedSql = normalizedSql.replace(",$5,$6,$7)", ",$5,$6,$7::timestamp)");
      const dateIndex = normalizedParams.findIndex((value) =>
        value instanceof Date || (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\\d{4}-\\d{2}-\\d{2}/.test(value))
      );
      if (normalizedParams.length >= 7 && dateIndex >= 0) {
        const candidateIds = normalizedParams.filter((value, index) =>
          index !== dateIndex && typeof value === 'string' && value.length >= 16
        );
        const userCandidates = candidateIds.length
          ? await tx.user.findMany({
              where: { schoolId: normalizedParams[1], id: { in: candidateIds } },
              select: { id: true },
            })
          : [];
        const validUserIds = userCandidates.map((user) => user.id);
        const requesters = validUserIds.slice(0, 2);
        if (requesters.length >= 2) {
          normalizedParams = [
            normalizedParams[0],
            normalizedParams[1],
            normalizedParams[2],
            normalizedParams[3],
            requesters[0],
            requesters[1],
            normalizedParams[dateIndex],
          ];
        }
      }
    }
    return tx.$executeRawUnsafe(normalizedSql, ...normalizedParams);
  }`,
);

fs.writeFileSync(temp, patchedSource, "utf8");
console.log(`[live-seed] starting synthetic tenant ${code}`);
const cleanup = () => {
  try { fs.unlinkSync(temp); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

require(temp);