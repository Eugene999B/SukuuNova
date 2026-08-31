import { describe, expect, it } from "vitest";
import { signDevicePayload, verifyDeviceSignature } from "../src/lib/device-auth";

const apiKeyHash = "a".repeat(64);
const rawBody = JSON.stringify({ schoolCode: "school-a", deviceSerial: "gate-01", kind: "card", idempotencyKey: "operation-1234", type: "in" });
const timestamp = String(Date.now());
const nonce = "nonce-123456";

describe("device request authentication", () => {
  it("accepts a valid HMAC signature inside the replay window", () => {
    const signature = signDevicePayload(apiKeyHash, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      timestamp,
      nonce,
      rawBody,
      signature,
      now: new Date(Number(timestamp)),
    })).not.toThrow();
  });

  it("rejects a modified body even when the timestamp and nonce are valid", () => {
    const signature = signDevicePayload(apiKeyHash, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
      timestamp,
      nonce,
      rawBody: rawBody.replace("gate-01", "gate-02"),
      signature,
      now: new Date(Number(timestamp)),
    })).toThrow(/Invalid device signature/);
  });

  it("rejects requests outside the replay window", () => {
    const signature = signDevicePayload(apiKeyHash, timestamp, nonce, rawBody);

    expect(() => verifyDeviceSignature({
      apiKeyHash,
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
      timestamp,
      nonce,
      rawBody,
      signature: "not-a-hex-signature",
      now: new Date(Number(timestamp)),
    })).toThrow(/Invalid device signature/);
  });
});
