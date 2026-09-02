import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStaffAttendanceQr, freshChallengeId, freshNonce, verifyStaffAttendanceQr } from "@/lib/qr-attendance";
import { jwtVerify } from "jose";

const TEST_SECRET = "qr-attendance-test-secret-01234567890123456789";

beforeEach(() => {
  process.env.SCHOOL_AUTH_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.SCHOOL_AUTH_SECRET;
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

    process.env.SCHOOL_AUTH_SECRET = "another-test-secret-012345678901234567890";
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
});
