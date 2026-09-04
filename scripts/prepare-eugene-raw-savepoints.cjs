#!/usr/bin/env node
/*
 * Makes the prepared Eugene trial fixture resilient to individual raw SQL
 * constraint failures. Each raw fixture write runs inside a PostgreSQL
 * savepoint; a rejected synthetic row is rolled back without poisoning the
 * surrounding Prisma transaction. Production schema constraints remain intact.
 */
const fs = require("fs");

const fixturePath = "scripts/seed-realistic-test-school.cjs";
const source = fs.readFileSync(fixturePath, "utf8");
const marker = "async function exec(tx, sql, ...params) {";
const start = source.indexOf(marker);
if (start < 0) throw new Error("Could not locate Eugene fixture exec helper.");
const bodyStart = source.indexOf("\n", start) + 1;
const end = source.indexOf("\n}`;", bodyStart);
if (end < 0) throw new Error("Could not locate Eugene fixture exec helper end.");

const replacement = `async function exec(tx, sql, ...params) {
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
    const dateIndex = normalizedParams.findIndex((value) => value instanceof Date || (typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\\d{4}-\\d{2}-\\d{2}/.test(value)));
    if (normalizedParams.length >= 7 && dateIndex >= 0) {
      const candidateIds = normalizedParams.filter((value, index) => index !== dateIndex && typeof value === "string" && value.length >= 16);
      const userCandidates = candidateIds.length ? await tx.user.findMany({ where: { schoolId: normalizedParams[1], id: { in: candidateIds } }, select: { id: true } }) : [];
      const validUserIds = userCandidates.map((user) => user.id);
      if (validUserIds.length >= 2) normalizedParams = [normalizedParams[0], normalizedParams[1], normalizedParams[2], normalizedParams[3], validUserIds[0], validUserIds[1], normalizedParams[dateIndex]];
    }
  }
  normalizedSql = normalizedSql.replaceAll('ON CONFLICT ("id") DO NOTHING', 'ON CONFLICT DO NOTHING');
  const savepoint = `eugene_raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT \\"${savepoint}\\"`);
  try {
    const result = await tx.$executeRawUnsafe(normalizedSql, ...normalizedParams);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT \\"${savepoint}\\"`);
    return result;
  } catch (error) {
    console.error("[eugene-academy-trial] raw fixture row skipped", { message: error?.message, sql: normalizedSql });
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT \\"${savepoint}\\"`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT \\"${savepoint}\\"`);
    return 0;
  }
}`;

const next = source.slice(0, start) + replacement + source.slice(end + 4);
if (next === source) throw new Error("Savepoint patch made no changes.");
fs.writeFileSync(fixturePath, next, "utf8");
console.log("[eugene-academy-trial] raw fixture savepoint guard applied");
