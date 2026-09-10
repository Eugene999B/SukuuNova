"use strict";

const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const APPLICATION_TABLE_EXCLUSION = "_prisma_migrations";
const EXECUTE_CONFIRMATION = "YES_DELETE_APPLICATION_DATA";

function parseResetTarget(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("RESET_DATABASE_URL is required; DATABASE_URL is intentionally not used as a fallback.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("RESET_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    throw new Error("RESET_DATABASE_URL must use the postgresql:// or postgres:// scheme.");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  } catch {
    throw new Error("RESET_DATABASE_URL contains an invalid encoded database name.");
  }
  if (!databaseName || databaseName.includes("/")) throw new Error("RESET_DATABASE_URL must identify exactly one database name.");
  if (SYSTEM_DATABASES.has(databaseName.toLowerCase())) {
    throw new Error(`Refusing application-data reset for PostgreSQL system database: ${databaseName}.`);
  }

  return {
    url: value,
    host: parsed.hostname,
    port: parsed.port || null,
    name: databaseName,
  };
}

function quotePgIdentifier(identifier) {
  const value = String(identifier || "");
  if (!value) throw new Error("PostgreSQL identifier cannot be empty.");
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeResetMode(mode) {
  const normalized = String(mode || "preview").trim().toLowerCase();
  if (normalized !== "preview" && normalized !== "execute") {
    throw new Error("RESET_MODE must be either preview or execute.");
  }
  return normalized;
}

function assertResetAuthorization({ mode, databaseName, allowValue, confirmDatabaseName }) {
  const normalizedMode = normalizeResetMode(mode);
  if (normalizedMode === "preview") return { mode: normalizedMode, authorized: false };

  if (String(allowValue || "") !== EXECUTE_CONFIRMATION) {
    throw new Error(`Destructive reset requires ALLOW_APPLICATION_DATA_RESET=${EXECUTE_CONFIRMATION}.`);
  }
  if (String(confirmDatabaseName || "") !== databaseName) {
    throw new Error("Destructive reset requires RESET_CONFIRM_DATABASE_NAME to exactly match the target database name.");
  }
  return { mode: normalizedMode, authorized: true };
}

function safeDatabaseSummary(target) {
  return {
    host: target.host,
    ...(target.port ? { port: target.port } : {}),
    name: target.name,
  };
}

async function withExactTableVisibility(db, applicationTables, work) {
  const targetNames = new Set(applicationTables.map(String));
  const rows = await db.$queryRawUnsafe(
    `SELECT c.relname AS "tableName",
            pg_get_userbyid(c.relowner) AS "ownerName",
            current_user AS "currentUser"
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
        AND c.relkind IN ('r','p')
        AND c.relforcerowsecurity = true
      ORDER BY c.relname`,
  );
  const forcedTables = rows.filter((row) => targetNames.has(String(row.tableName)));
  const notOwned = forcedTables.filter((row) => String(row.ownerName) !== String(row.currentUser));
  if (notOwned.length > 0) {
    throw new Error(
      `Exact reset verification requires a table-owner maintenance connection; ${notOwned.length} forced-RLS table(s) are owned by another role.`,
    );
  }

  for (const row of forcedTables) {
    await db.$executeRawUnsafe(`ALTER TABLE ${quotePgIdentifier(String(row.tableName))} NO FORCE ROW LEVEL SECURITY`);
  }

  const result = await work();

  for (const row of forcedTables) {
    await db.$executeRawUnsafe(`ALTER TABLE ${quotePgIdentifier(String(row.tableName))} FORCE ROW LEVEL SECURITY`);
  }
  return result;
}

module.exports = {
  APPLICATION_TABLE_EXCLUSION,
  EXECUTE_CONFIRMATION,
  SYSTEM_DATABASES,
  parseResetTarget,
  quotePgIdentifier,
  normalizeResetMode,
  assertResetAuthorization,
  safeDatabaseSummary,
  withExactTableVisibility,
};
