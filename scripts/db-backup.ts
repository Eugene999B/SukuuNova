import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  BACKUP_ALGORITHM,
  BACKUP_MANIFEST_VERSION,
  databaseFingerprint,
  parseBackupEncryptionKey,
  type BackupManifest,
} from "../src/lib/backup-integrity";

async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for db:backup.");
  const key = parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const outputDir = resolve(process.env.BACKUP_DIR?.trim() || "backups");
  await mkdir(outputDir, { recursive: true, mode: 0o700 });

  const workDir = await mkdtemp(join(tmpdir(), "sukuunova-backup-"));
  const dumpPath = join(workDir, "database.dump");
  const fileStem = `sukuunova-${stamp()}`;
  const encryptedPath = join(outputDir, `${fileStem}.dump.enc`);
  const manifestPath = join(outputDir, `${fileStem}.manifest.json`);

  try {
    console.log("Creating PostgreSQL custom-format backup...");
    execFileSync("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      dumpPath,
      databaseUrl,
    ], { stdio: "inherit" });
    await chmod(dumpPath, 0o600);

    const plaintextSha256 = await hashFile(dumpPath);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    await pipeline(
      createReadStream(dumpPath),
      cipher,
      createWriteStream(encryptedPath, { mode: 0o600 }),
    );
    const authTag = cipher.getAuthTag();
    const encryptedSha256 = await hashFile(encryptedPath);

    const manifest: BackupManifest = {
      version: BACKUP_MANIFEST_VERSION,
      algorithm: BACKUP_ALGORITHM,
      createdAt: new Date().toISOString(),
      encryptedFile: basename(encryptedPath),
      encryptedSha256,
      plaintextSha256,
      ivBase64: iv.toString("base64"),
      authTagBase64: authTag.toString("base64"),
      sourceDatabaseFingerprint: databaseFingerprint(databaseUrl),
      pgDumpFormat: "custom",
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

    console.log(`Encrypted backup: ${encryptedPath}`);
    console.log(`Integrity manifest: ${manifestPath}`);
    console.log("Keep BACKUP_ENCRYPTION_KEY outside the backup location and secret manager audit scope enabled.");
  } catch (error) {
    await rm(encryptedPath, { force: true }).catch(() => undefined);
    await rm(manifestPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
