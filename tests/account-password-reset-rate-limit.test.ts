import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issueSchoolPasswordReset: vi.fn(),
  confirmSchoolPasswordReset: vi.fn(),
  deliverResetToken: vi.fn(),
  resolveAccountLoginRateIdentity: vi.fn(),
  recordLoginAttempt: vi.fn(),
  clearAccountLoginAttempts: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({
  issueSchoolPasswordReset: mocks.issueSchoolPasswordReset,
  confirmSchoolPasswordReset: mocks.confirmSchoolPasswordReset,
}));

vi.mock("@/lib/account-login-identity", () => ({
  resolveAccountLoginRateIdentity: mocks.resolveAccountLoginRateIdentity,
  accountLoginRateIdentityForUserId: (userId: string) => `user:${userId}`,
}));
vi.mock("@/lib/reset-delivery", () => ({ deliverResetToken: mocks.deliverResetToken }));
vi.mock("@/lib/rate-limit", () => ({
  recordLoginAttempt: mocks.recordLoginAttempt,
  clearAccountLoginAttempts: mocks.clearAccountLoginAttempts,
}));

import { POST as requestReset } from "../src/app/api/auth/school/password-reset/request/route";
import { POST as confirmReset } from "../src/app/api/auth/school/password-reset/confirm/route";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.9" },
    body: JSON.stringify(body),
  });
}

describe("school password recovery throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAccountLoginRateIdentity.mockResolvedValue("user:user-1");
    mocks.recordLoginAttempt.mockResolvedValue("rate-key");
    mocks.clearAccountLoginAttempts.mockResolvedValue(undefined);
    mocks.issueSchoolPasswordReset.mockResolvedValue(null);
    mocks.deliverResetToken.mockResolvedValue(undefined);
    mocks.confirmSchoolPasswordReset.mockResolvedValue({
      schoolCode: "eug123",
      userId: "user-1",
      email: "teacher@gmail.com",
      phone: "0244000000",
      universe: "school",
    });
  });

  it("rate-limits reset requests by the canonical account rather than a shared school/IP bucket", async () => {
    const response = await requestReset(jsonRequest("https://example.test/api/reset", {
      uniqueCode: "EUG123",
      identifier: "teacher@gmail.com",
      universe: "school",
    }));
    expect(response.status).toBe(202);
    expect(mocks.resolveAccountLoginRateIdentity).toHaveBeenCalledWith({ schoolCode: "eug123", identifier: "teacher@gmail.com", universe: "school" });
    expect(mocks.recordLoginAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordLoginAttempt).toHaveBeenCalledWith("school-password-reset:eug123", "user:user-1");
  });

  it("clears staff and guardian failed-login locks after a successful password reset", async () => {
    const response = await confirmReset(jsonRequest("https://example.test/api/reset/confirm", {
      uniqueCode: "EUG123",
      token: "abcdefghijklmnopqrstuvwxyz0123456789TOKEN",
      newPassword: "A-new-secure-password-2026",
      universe: "school",
    }));
    expect(response.status).toBe(200);
    expect(mocks.clearAccountLoginAttempts).toHaveBeenCalledWith("school-login:eug123", ["user:user-1"]);
    expect(mocks.clearAccountLoginAttempts).toHaveBeenCalledWith("guardian-login:eug123", ["user:user-1"]);
  });
});
