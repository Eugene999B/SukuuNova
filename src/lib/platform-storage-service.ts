import { withTenant } from "@/lib/db";

export type SchoolStorageEstimate = {
  bytes: number;
  rows: number;
  tables: number;
  largestTables: Array<{ table: string; bytes: number; rows: number }>;
};

function quoteIdent(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function asSafeNumber(value: string | number | bigint | null | undefined) {
  if (value == null) return 0;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

export async function getSchoolStorageEstimate(schoolId: string): Promise<SchoolStorageEstimate> {
  return withTenant(schoolId, async (tx) => {
    const tables = await tx.$queryRawUnsafe<Array<{ tableName: string }>>(
      `SELECT DISTINCT c.table_name AS "tableName"
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema=c.table_schema AND t.table_name=c.table_name
       WHERE c.table_schema='public'
         AND c.column_name='schoolId'
         AND t.table_type='BASE TABLE'
       ORDER BY c.table_name`,
    );

    const breakdown: Array<{ table: string; bytes: number; rows: number }> = [];
    for (const { tableName } of tables) {
      const identifier = quoteIdent(tableName);
      const result = await tx.$queryRawUnsafe<Array<{ rows: string; bytes: string }>>(
        `SELECT COUNT(*)::text AS "rows",
                COALESCE(SUM(pg_column_size(t)),0)::text AS "bytes"
         FROM ${identifier} t
         WHERE "schoolId"=$1`,
        schoolId,
      );
      const rows = asSafeNumber(result[0]?.rows);
      const bytes = asSafeNumber(result[0]?.bytes);
      if (rows > 0 || bytes > 0) breakdown.push({ table: tableName, rows, bytes });
    }

    breakdown.sort((a, b) => b.bytes - a.bytes || b.rows - a.rows || a.table.localeCompare(b.table));
    return {
      bytes: breakdown.reduce((sum, item) => sum + item.bytes, 0),
      rows: breakdown.reduce((sum, item) => sum + item.rows, 0),
      tables: breakdown.length,
      largestTables: breakdown.slice(0, 6),
    };
  });
}

export async function getSchoolStorageEstimates(schoolIds: string[]) {
  const unique = [...new Set(schoolIds.filter(Boolean))];
  const entries: Array<[string, SchoolStorageEstimate]> = [];
  for (const schoolId of unique) {
    entries.push([schoolId, await getSchoolStorageEstimate(schoolId)]);
  }
  return Object.fromEntries(entries) as Record<string, SchoolStorageEstimate>;
}
