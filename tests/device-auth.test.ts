import { describe, expect, it } from "vitest";
import { hashDeviceSecret, signDevicePayload, verifyDeviceSignature } from "../src/lib/device-auth";

const deviceSecret = "device-secret-for-test-only";
const apiKeyHash = hashDeviceSecret(deviceSecret);
const rawBody = JSON.stringify({ schoolCode: "school-a", deviceSerial: "gate-01", kind: "card", idempotencyKey: "operation-1234", type: "in" });
const timestamp = String(Date.now());
const nonce = "nonce-123456";

describe("device request authentication", () => {
  it("accepts a valid raw-secret HMAC signature inside the replay window", () => {
    const signature = signDevicePayload(deviceSecret, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      deviceSecret,
      timestamp,
      nonce,
      rawBody,
      signature,
      now: new Date(Number(timestamp)),
    })).not.toThrow();
  });

  it("rejects a modified body even when the timestamp and nonce are valid", () => {
    const signature = signDevicePayload(deviceSecret, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      deviceSecret,
      timestamp,
      nonce,
      rawBody: rawBody.replace("gate-01", "gate-02"),
      signature,
      now: new Date(Number(timestamp)),
    })).toThrow(/Invalid device signature/);
  });

  it("rejects a wrong raw device secret", () => {
    const signature = signDevicePayload("incorrect-device-secret", timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      deviceSecret: "incorrect-device-secret",
      timestamp,
      nonce,
      rawBody,
      signature,
      now: new Date(Number(timestamp)),
    })).toThrow(/Invalid device signature/);
  });

  it("rejects requests outside the replay window", () => {
    const signature = signDevicePayload(deviceSecret, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      deviceSecret,
      timestamp,
      nonce,
      rawBody,
      signature,
      now: new Date(Number(timestamp) + 5 * 60 * 1000 + 1),
    })).toThrow(/outside the allowed replay window/);
  });

  it("rejects malformed signatures before comparison", () => {
    expect(() => verifyDeviceSignature({
      apiKeyHash,
      deviceSecret,
      timestamp,
      nonce,
      rawBody,
      signature: "not-a-hex-signature",
      now: new Date(Number(timestamp)),
    })).toThrow(/Invalid device signature/);
  });
});
