import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  databaseFingerprint,
  equalSha256Hex,
  parseBackupEncryptionKey,
  sameDatabaseIdentity,
  validateBackupManifest,
} from "../src/lib/backup-integrity";

async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function scalar(databaseUrl: string, sql: string) {
  return execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

async function main() {
  const manifestInput = process.env.BACKUP_MANIFEST?.trim();
  const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!manifestInput) throw new Error("BACKUP_MANIFEST is required for db:restore:verify.");
  if (!restoreDatabaseUrl) throw new Error("RESTORE_DATABASE_URL is required for db:restore:verify.");
  const productionUrl = process.env.DATABASE_URL?.trim();
  const key = parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);

  const manifestPath = resolve(manifestInput);
  const manifest = validateBackupManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  if (basename(manifest.encryptedFile) !== manifest.encryptedFile) throw new Error("Backup manifest encryptedFile must be a file name, not a path.");
  const encryptedPath = join(dirname(manifestPath), manifest.encryptedFile);

  if (databaseFingerprint(restoreDatabaseUrl) === manifest.sourceDatabaseFingerprint) {
    throw new Error("Restore verification refuses to target the source database identity.");
  }
  if (productionUrl && sameDatabaseIdentity(restoreDatabaseUrl, productionUrl)) {
    throw new Error("Restore verification refuses to target DATABASE_URL. Create a separate empty drill database.");
  }

  const encryptedHash = await hashFile(encryptedPath);
  if (!equalSha256Hex(encryptedHash, manifest.encryptedSha256)) throw new Error("Encrypted backup SHA-256 does not match the manifest.");

  const tableCount = Number(scalar(restoreDatabaseUrl, "SELECT count(*) FROM pg_tables WHERE schemaname='public';"));
  if (!Number.isFinite(tableCount) || tableCount !== 0) {
    throw new Error("RESTORE_DATABASE_URL must point to an empty database. Verification will not overwrite an existing schema.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "sukuunova-restore-"));
  const dumpPath = join(workDir, "database.dump");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.ivBase64, "base64"));
    decipher.setAuthTag(Buffer.from(manifest.authTagBase64, "base64"));
    await pipeline(
      createReadStream(encryptedPath),
      decipher,
      createWriteStream(dumpPath, { mode: 0o600 }),
    );
    await chmod(dumpPath, 0o600);

    const plaintextHash = await hashFile(dumpPath);
    if (!equalSha256Hex(plaintextHash, manifest.plaintextSha256)) throw new Error("Decrypted backup SHA-256 does not match the manifest.");

    console.log("Validating PostgreSQL archive structure...");
    execFileSync("pg_restore", ["--list", dumpPath], { stdio: ["ignore", "ignore", "inherit"] });

    console.log("Restoring into isolated verification database...");
    execFileSync("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      restoreDatabaseUrl,
      dumpPath,
    ], { stdio: "inherit" });

    const migrationCount = Number(scalar(restoreDatabaseUrl, `SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;`));
    const schoolCount = Number(scalar(restoreDatabaseUrl, `SELECT count(*) FROM "School";`));
    if (!Number.isFinite(migrationCount) || migrationCount < 1) throw new Error("Restore completed but migration history verification failed.");
    if (!Number.isFinite(schoolCount) || schoolCount < 0) throw new Error("Restore completed but core school-table verification failed.");

    console.log(`Restore verification passed: ${migrationCount} applied migrations, ${schoolCount} school record(s).`);
    console.log("The verification database is intentionally left intact for operator inspection; remove it after the drill.");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Restore verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
