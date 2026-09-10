#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const {
  APPLICATION_TABLE_EXCLUSION,
  parseResetTarget,
  quotePgIdentifier,
  safeDatabaseSummary,
} = require("./data-reset-safety.cjs");

const target = parseResetTarget(process.env.RESET_DATABASE_URL);
const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });

async function main() {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname='public' AND tablename <> $1
      ORDER BY tablename`,
    APPLICATION_TABLE_EXCLUSION,
  );
  const tables = tableRows.map((row) => String(row.tablename));

  const nonEmptyTables = [];
  let applicationRows = 0;
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM ${quotePgIdentifier(table)}`);
    const count = Number(rows[0]?.count ?? 0);
    const safeCount = Number.isFinite(count) ? count : 0;
    applicationRows += safeCount;
    if (safeCount > 0) nonEmptyTables.push({ table, count: safeCount });
  }

  const migrationTableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present`,
  );
  const migrationTablePresent = Boolean(migrationTableRows[0]?.present);
  let migrationRows = 0;
  if (migrationTablePresent) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`);
    migrationRows = Number(rows[0]?.count ?? 0);
    if (!Number.isFinite(migrationRows)) migrationRows = 0;
  }

  const schemaIntact = migrationTablePresent && migrationRows > 0 && tables.length > 0;
  const empty = applicationRows === 0;
  const result = {
    database: safeDatabaseSummary(target),
    schemaIntact,
    migrationRows,
    applicationTables: tables.length,
    applicationRows,
    empty,
    nonEmptyTables,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!schemaIntact || !empty) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
