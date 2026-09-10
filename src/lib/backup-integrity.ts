import { createHash, timingSafeEqual } from "node:crypto";

export const BACKUP_MANIFEST_VERSION = 1 as const;
export const BACKUP_ALGORITHM = "aes-256-gcm" as const;

export type BackupManifest = {
  version: typeof BACKUP_MANIFEST_VERSION;
  algorithm: typeof BACKUP_ALGORITHM;
  createdAt: string;
  encryptedFile: string;
  encryptedSha256: string;
  plaintextSha256: string;
  ivBase64: string;
  authTagBase64: string;
  sourceDatabaseFingerprint: string;
  pgDumpFormat: "custom";
};

export function parseBackupEncryptionKey(value: string | undefined) {
  if (!value?.trim()) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
  const raw = value.trim();
  let key: Buffer;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try { key = Buffer.from(raw, "base64"); }
    catch { throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes encoded as hex or base64."); }
  }
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function databaseIdentity(connectionString: string) {
  const url = new URL(connectionString);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) throw new Error("Database URL must use postgres:// or postgresql://.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Database URL must include a database name.");
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`;
}

export function databaseFingerprint(connectionString: string) {
  return createHash("sha256").update(databaseIdentity(connectionString), "utf8").digest("hex");
}

export function sameDatabaseIdentity(left: string, right: string) {
  return databaseIdentity(left) === databaseIdentity(right);
}

export function sha256Hex(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function equalSha256Hex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateBackupManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Backup manifest is invalid.");
  const row = value as Record<string, unknown>;
  if (row.version !== BACKUP_MANIFEST_VERSION || row.algorithm !== BACKUP_ALGORITHM || row.pgDumpFormat !== "custom") {
    throw new Error("Backup manifest version or algorithm is unsupported.");
  }
  for (const key of ["createdAt", "encryptedFile", "encryptedSha256", "plaintextSha256", "ivBase64", "authTagBase64", "sourceDatabaseFingerprint"] as const) {
    if (typeof row[key] !== "string" || !row[key]) throw new Error(`Backup manifest field ${key} is invalid.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(row.encryptedSha256 as string) || !/^[a-f0-9]{64}$/i.test(row.plaintextSha256 as string) || !/^[a-f0-9]{64}$/i.test(row.sourceDatabaseFingerprint as string)) {
    throw new Error("Backup manifest hashes are invalid.");
  }
  if (!Number.isFinite(Date.parse(row.createdAt as string))) throw new Error("Backup manifest createdAt is invalid.");
  const iv = Buffer.from(row.ivBase64 as string, "base64");
  const tag = Buffer.from(row.authTagBase64 as string, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Backup manifest encryption metadata is invalid.");
  return row as BackupManifest;
}
