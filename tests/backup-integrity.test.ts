import { describe, expect, it } from "vitest";
import {
  BACKUP_ALGORITHM,
  BACKUP_MANIFEST_VERSION,
  databaseFingerprint,
  databaseIdentity,
  equalSha256Hex,
  parseBackupEncryptionKey,
  sameDatabaseIdentity,
  sha256Hex,
  validateBackupManifest,
} from "../src/lib/backup-integrity";

describe("backup integrity safeguards", () => {
  it("accepts exactly 32-byte hex or base64 encryption keys", () => {
    const bytes = Buffer.alloc(32, 7);
    expect(parseBackupEncryptionKey(bytes.toString("hex"))).toEqual(bytes);
    expect(parseBackupEncryptionKey(bytes.toString("base64"))).toEqual(bytes);
    expect(() => parseBackupEncryptionKey("short")).toThrow(/32 bytes/);
    expect(() => parseBackupEncryptionKey(undefined)).toThrow(/required/);
  });

  it("compares database identities without credentials", () => {
    const a = "postgresql://alice:secret@db.example.com:5432/sukuunova";
    const b = "postgres://bob:other@db.example.com/sukuunova";
    const c = "postgresql://alice:secret@db.example.com:5432/restore_drill";
    expect(databaseIdentity(a)).toBe("db.example.com:5432/sukuunova");
    expect(sameDatabaseIdentity(a, b)).toBe(true);
    expect(sameDatabaseIdentity(a, c)).toBe(false);
    expect(databaseFingerprint(a)).toBe(databaseFingerprint(b));
    expect(databaseFingerprint(a)).not.toBe(databaseFingerprint(c));
  });

  it("validates manifests and rejects unsupported or malformed encryption metadata", () => {
    const manifest = {
      version: BACKUP_MANIFEST_VERSION,
      algorithm: BACKUP_ALGORITHM,
      createdAt: new Date().toISOString(),
      encryptedFile: "sukuunova.dump.enc",
      encryptedSha256: "a".repeat(64),
      plaintextSha256: "b".repeat(64),
      ivBase64: Buffer.alloc(12, 1).toString("base64"),
      authTagBase64: Buffer.alloc(16, 2).toString("base64"),
      sourceDatabaseFingerprint: "c".repeat(64),
      pgDumpFormat: "custom" as const,
    };
    expect(validateBackupManifest(manifest)).toEqual(manifest);
    expect(() => validateBackupManifest({ ...manifest, version: 2 })).toThrow(/unsupported/);
    expect(() => validateBackupManifest({ ...manifest, ivBase64: Buffer.alloc(8).toString("base64") })).toThrow(/encryption metadata/);
  });

  it("uses constant-time-compatible SHA-256 comparisons for valid digests", () => {
    const a = sha256Hex("backup-a");
    const same = sha256Hex("backup-a");
    const other = sha256Hex("backup-b");
    expect(equalSha256Hex(a, same)).toBe(true);
    expect(equalSha256Hex(a, other)).toBe(false);
    expect(equalSha256Hex("not-a-hash", other)).toBe(false);
  });
});
