#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const {
  APPLICATION_TABLE_EXCLUSION,
  parseResetTarget,
  quotePgIdentifier,
  normalizeResetMode,
  assertResetAuthorization,
  safeDatabaseSummary,
} = require("./data-reset-safety.cjs");

const target = parseResetTarget(process.env.RESET_DATABASE_URL);
const mode = normalizeResetMode(process.env.RESET_MODE);
assertResetAuthorization({
  mode,
  databaseName: target.name,
  allowValue: process.env.ALLOW_APPLICATION_DATA_RESET,
  confirmDatabaseName: process.env.RESET_CONFIRM_DATABASE_NAME,
});

const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });

async function listApplicationTables(db) {
  const rows = await db.$queryRawUnsafe(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname='public' AND tablename <> $1
      ORDER BY tablename`,
    APPLICATION_TABLE_EXCLUSION,
  );
  return rows.map((row) => String(row.tablename));
}

async function tableCounts(db, tables) {
  const result = [];
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM ${quotePgIdentifier(table)}`);
    const count = Number(rows[0]?.count ?? 0);
    result.push({ table, count: Number.isFinite(count) ? count : 0 });
  }
  return result;
}

async function main() {
  const tables = await listApplicationTables(prisma);
  const before = await tableCounts(prisma, tables);
  const beforeRows = before.reduce((sum, item) => sum + item.count, 0);
  const beforeNonEmpty = before.filter((item) => item.count > 0);

  if (mode === "preview") {
    console.log(JSON.stringify({
      mode,
      database: safeDatabaseSummary(target),
      applicationTables: tables.length,
      applicationRows: beforeRows,
      nonEmptyTables: beforeNonEmpty,
      destructiveActionPerformed: false,
      nextStep: "Run again with RESET_MODE=execute, the explicit allow phrase, and the exact database-name confirmation only after reviewing this preview.",
    }, null, 2));
    return;
  }

  if (tables.length > 0) {
    await prisma.$transaction(async (tx) => {
      const quotedTables = tables.map(quotePgIdentifier).join(", ");
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
      const remaining = await tableCounts(tx, tables);
      const nonEmpty = remaining.filter((item) => item.count > 0);
      if (nonEmpty.length > 0) {
        throw new Error(`Application-data reset verification failed; ${nonEmpty.length} table(s) still contain rows.`);
      }
    }, { maxWait: 60_000, timeout: 300_000 });
  }

  const after = await tableCounts(prisma, tables);
  const remainingRows = after.reduce((sum, item) => sum + item.count, 0);
  console.log(JSON.stringify({
    mode,
    database: safeDatabaseSummary(target),
    applicationTables: tables.length,
    rowsRemoved: beforeRows,
    remainingApplicationRows: remainingRows,
    empty: remainingRows === 0,
    preserved: [APPLICATION_TABLE_EXCLUSION],
    destructiveActionPerformed: true,
  }, null, 2));

  if (remainingRows !== 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
