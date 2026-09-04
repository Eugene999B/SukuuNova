import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The raw registration secret is never stored. Its SHA-256 digest verifies the
 * device secret; HMAC signatures are made with the raw secret supplied by the device.
 */
export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function signDevicePayload(
  deviceSecret: string,
  timestamp: string,
  nonce: string,
  rawBody: string
): string {
  return createHmac("sha256", deviceSecret)
    .update(timestamp + "\n" + nonce + "\n" + rawBody, "utf8")
    .digest("hex");
}

export function verifyDeviceSignature(input: {
  apiKeyHash: string;
  deviceSecret: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
  signature: string;
  now?: Date;
  maxSkewMs?: number;
}): void {
  const timestampMs = Number(input.timestamp);
  if (!Number.isInteger(timestampMs)) {
    throw new AppError("Invalid device timestamp.", 401, "INVALID_DEVICE_SIGNATURE");
  }

  const now = input.now ?? new Date();
  const maxSkewMs = input.maxSkewMs ?? 5 * 60 * 1000;
  if (Math.abs(now.getTime() - timestampMs) > maxSkewMs) {
    throw new AppError(
      "Device request timestamp is outside the allowed replay window.",
      401,
      "DEVICE_TIMESTAMP_EXPIRED"
    );
  }

  if (!/^[0-9a-f]{64}$/i.test(input.signature)) {
    throw new AppError("Invalid device signature.", 401, "INVALID_DEVICE_SIGNATURE");
  }

  const storedHash = Buffer.from(input.apiKeyHash, "hex");
  const suppliedHash = Buffer.from(hashDeviceSecret(input.deviceSecret), "hex");
  if (storedHash.length !== suppliedHash.length || !timingSafeEqual(storedHash, suppliedHash)) {
    throw new AppError("Invalid device signature.", 401, "INVALID_DEVICE_SIGNATURE");
  }

  const expected = Buffer.from(
    signDevicePayload(input.deviceSecret, input.timestamp, input.nonce, input.rawBody),
    "hex"
  );
  const received = Buffer.from(input.signature, "hex");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new AppError("Invalid device signature.", 401, "INVALID_DEVICE_SIGNATURE");
  }
}
