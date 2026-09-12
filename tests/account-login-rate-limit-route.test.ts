import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, RateLimitError } from "../src/lib/errors";

const mocks = vi.hoisted(() => ({
  authenticateSchoolUser: vi.fn(),
  authenticateGuardianUser: vi.fn(),
  assertAccountLoginAllowed: vi.fn(),
  clearAccountLoginAttempts: vi.fn(),
  recordFailedAccountLogin: vi.fn(),
  createSchoolSessionTokenFromAuthorizationVersion: vi.fn(),
  createGuardianSessionToken: vi.fn(),
}));

vi.mock("@/lib/login-service", () => ({
  authenticateSchoolUser: mocks.authenticateSchoolUser,
  authenticateGuardianUser: mocks.authenticateGuardianUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  assertAccountLoginAllowed: mocks.assertAccountLoginAllowed,
  clearAccountLoginAttempts: mocks.clearAccountLoginAttempts,
  recordFailedAccountLogin: mocks.recordFailedAccountLogin,
}));

vi.mock("@/lib/auth", () => ({
  PLATFORM_COOKIE: "platform",
  SCHOOL_COOKIE: "school",
  createSchoolSessionTokenFromAuthorizationVersion: mocks.createSchoolSessionTokenFromAuthorizationVersion,
  sessionCookieOptions: () => ({ path: "/", httpOnly: true }),
}));

vi.mock("@/lib/guardian-auth", () => ({
  GUARDIAN_COOKIE: "guardian",
  createGuardianSessionToken: mocks.createGuardianSessionToken,
}));

import { POST as schoolLogin } from "../src/app/api/auth/school/login/route";
import { POST as guardianLogin } from "../src/app/api/auth/guardian/login/route";

function request(body: unknown) {
  return new Request("https://example.test/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.8" },
    body: JSON.stringify(body),
  });
}

const schoolAccount = {
  userId: "user-1",
  schoolId: "school-1",
  name: "Ama Owusu",
  schoolName: "Eugene Academy",
  portal: "/dashboard",
  roles: ["Teacher"],
  needsPasswordChange: false,
  authorizationVersion: "v1",
};

const guardianAccount = {
  userId: "user-2",
  guardianId: "guardian-1",
  schoolId: "school-1",
  name: "Kofi Mensah",
  schoolName: "Eugene Academy",
  needsPasswordChange: false,
};

describe("account-scoped school login throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertAccountLoginAllowed.mockResolvedValue(undefined);
    mocks.clearAccountLoginAttempts.mockResolvedValue(undefined);
    mocks.recordFailedAccountLogin.mockResolvedValue(undefined);
    mocks.authenticateSchoolUser.mockResolvedValue(schoolAccount);
    mocks.authenticateGuardianUser.mockResolvedValue(guardianAccount);
    mocks.createSchoolSessionTokenFromAuthorizationVersion.mockResolvedValue("school-token");
    mocks.createGuardianSessionToken.mockResolvedValue("guardian-token");
  });

  it("does not consume a failed-attempt counter for a successful staff login", async () => {
    const response = await schoolLogin(request({ uniqueCode: "EUG123", identifier: "0244000000", password: "correct-password" }));
    expect(response.status).toBe(200);
    expect(mocks.assertAccountLoginAllowed).toHaveBeenCalledWith("school-login:eug123", "0244000000");
    expect(mocks.recordFailedAccountLogin).not.toHaveBeenCalled();
    expect(mocks.clearAccountLoginAttempts).toHaveBeenCalledWith("school-login:eug123", ["0244000000"]);
  });

  it("records a failed credential attempt only against that staff identity", async () => {
    mocks.authenticateSchoolUser.mockRejectedValueOnce(new AppError("Invalid credentials or inactive account.", 401, "UNAUTHORIZED"));
    const response = await schoolLogin(request({ uniqueCode: "EUG123", identifier: "teacher@gmail.com", password: "wrong-password" }));
    expect(response.status).toBe(401);
    expect(mocks.recordFailedAccountLogin).toHaveBeenCalledWith("school-login:eug123", "teacher@gmail.com");
    expect(mocks.clearAccountLoginAttempts).not.toHaveBeenCalled();
  });

  it("returns a lock only for the failing account after its threshold is reached", async () => {
    mocks.authenticateSchoolUser.mockRejectedValueOnce(new AppError("Invalid credentials or inactive account.", 401, "UNAUTHORIZED"));
    mocks.recordFailedAccountLogin.mockRejectedValueOnce(new RateLimitError(900));
    const response = await schoolLogin(request({ uniqueCode: "EUG123", identifier: "teacher@gmail.com", password: "wrong-password" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
  });

  it("uses the same per-account behavior for guardian phone/email login", async () => {
    const response = await guardianLogin(request({ schoolCode: "EUG123", identifier: "parent@gmail.com", password: "correct-password" }));
    expect(response.status).toBe(200);
    expect(mocks.assertAccountLoginAllowed).toHaveBeenCalledWith("guardian-login:eug123", "parent@gmail.com");
    expect(mocks.recordFailedAccountLogin).not.toHaveBeenCalled();
    expect(mocks.clearAccountLoginAttempts).toHaveBeenCalledWith("guardian-login:eug123", ["parent@gmail.com"]);
  });
});
