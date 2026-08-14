import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const configured = process.env.FACE_EMBEDDING_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("FACE_EMBEDDING_ENCRYPTION_KEY is required.");
  }
  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) {
    throw new Error("FACE_EMBEDDING_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return decoded;
}

export function encryptEmbeddingRef(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptEmbeddingRef(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Invalid encrypted face reference.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
