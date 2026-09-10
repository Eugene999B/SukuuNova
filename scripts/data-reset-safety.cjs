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

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
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

module.exports = {
  APPLICATION_TABLE_EXCLUSION,
  EXECUTE_CONFIRMATION,
  SYSTEM_DATABASES,
  parseResetTarget,
  quotePgIdentifier,
  normalizeResetMode,
  assertResetAuthorization,
  safeDatabaseSummary,
};
