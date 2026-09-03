import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStaffAttendanceQr, consumeStaffAttendanceQr, freshChallengeId, freshNonce, hashQrSecret, verifyStaffAttendanceQr, clientIpFromHeaders } from "@/lib/qr-attendance";
import { jwtVerify } from "jose";

const TEST_SECRET = "qr-attendance-test-secret-01234567890123456789";

beforeEach(() => {
  process.env.QR_AUTH_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.QR_AUTH_SECRET;
});

describe("staff attendance QR", () => {
  it("creates a school-wide token without teacher identity", async () => {
    const challengeId = freshChallengeId();
    const nonce = freshNonce();
    const token = await createStaffAttendanceQr("school-a", challengeId, nonce, new Date(Date.now() + 45_000));
    const result = await verifyStaffAttendanceQr(token, "school-a");

    expect(result).toEqual({
      schoolId: "school-a",
      purpose: "staff-check-in",
      challengeId,
      nonce
    });

    const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_SECRET), {
      issuer: "sukuunova-attendance",
      audience: "sukuunova-attendance"
    });
    expect(payload.sub).toBe("staff-check-in");
    expect(payload).not.toHaveProperty("teacherId");
    expect(payload).not.toHaveProperty("staffId");
  });

  it("rejects a token presented to another school", async () => {
    const token = await createStaffAttendanceQr(
      "school-a",
      freshChallengeId(),
      freshNonce(),
      new Date(Date.now() + 45_000)
    );

    await expect(verifyStaffAttendanceQr(token, "school-b")).rejects.toMatchObject({
      code: "INVALID_STAFF_QR",
      status: 400
    });
  });

  it("rejects a token with a different signing secret", async () => {
    const token = await createStaffAttendanceQr(
      "school-a",
      freshChallengeId(),
      freshNonce(),
      new Date(Date.now() + 45_000)
    );

    process.env.QR_AUTH_SECRET = "another-test-secret-012345678901234567890";
    await expect(verifyStaffAttendanceQr(token, "school-a")).rejects.toMatchObject({
      code: "INVALID_STAFF_QR",
      status: 400
    });
  });

  it("rejects an expired token", async () => {
    const token = await createStaffAttendanceQr(
      "school-a",
      freshChallengeId(),
      freshNonce(),
      new Date(Date.now() - 1_000)
    );

    await expect(verifyStaffAttendanceQr(token, "school-a")).rejects.toMatchObject({
      code: "INVALID_STAFF_QR",
      status: 400
    });
  });

  it("consumes a challenge once and rejects replay", async () => {
    const challengeId = freshChallengeId();
    const nonce = freshNonce();
    const findFirst = async () => ({
      after: {
        nonceHash: hashQrSecret(nonce),
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
        displayIpHash: "display-ip-hash"
      }
    });
    let createCount = 0;
    const tx = {
      auditLogSchool: {
        findFirst,
        createMany: async () => {
          createCount += 1;
          return { count: createCount === 1 ? 1 : 0 };
        }
      }
    } as unknown as Parameters<typeof consumeStaffAttendanceQr>[0];

    await expect(consumeStaffAttendanceQr(tx, {
      schoolId: "school-a",
      actorId: "teacher-a",
      challengeId,
      nonce,
      verification: "qr+network"
    })).resolves.toBeUndefined();

    await expect(consumeStaffAttendanceQr(tx, {
      schoolId: "school-a",
      actorId: "teacher-b",
      challengeId,
      nonce,
      verification: "qr+network"
    })).rejects.toMatchObject({
      code: "QR_REPLAY",
      status: 409
    });
  });

  it("does not treat x-forwarded-for as a trusted network identity", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "203.0.113.7"
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("unknown");
  });
});
