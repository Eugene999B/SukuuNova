import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTenant: vi.fn(),
  accountLoginLockState: vi.fn(),
  clearAccountLoginAttempts: vi.fn(),
  issueSchoolPasswordReset: vi.fn(),
  deliverResetToken: vi.fn(),
  appendPlatformAudit: vi.fn(),
  appendSchoolAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ withTenant: mocks.withTenant }));
vi.mock("@/lib/rate-limit", () => ({
  accountLoginLockState: mocks.accountLoginLockState,
  clearAccountLoginAttempts: mocks.clearAccountLoginAttempts,
}));
vi.mock("@/lib/password-reset", () => ({ issueSchoolPasswordReset: mocks.issueSchoolPasswordReset }));
vi.mock("@/lib/reset-delivery", () => ({ deliverResetToken: mocks.deliverResetToken }));
vi.mock("@/lib/audit", () => ({
  appendPlatformAudit: mocks.appendPlatformAudit,
  appendSchoolAudit: mocks.appendSchoolAudit,
}));

import { clearSchoolUserLoginLock, getSchoolUserSupportState, sendSchoolUserPasswordReset } from "../src/lib/platform-account-support-service";

const school = { id: "school-1", name: "Eugene Academy", uniqueCode: "EUG123" };
const user = {
  id: "user-1",
  name: "Ama Owusu",
  email: "ama@gmail.com",
  phone: "0244000000",
  status: "active",
  needsPasswordChange: false,
  guardianProfiles: [],
  userRoles: [{ role: { name: "Teacher", key: "teacher" } }],
};

function tenantResult() {
  const tx = {
    school: { findUnique: vi.fn().mockResolvedValue(school) },
    user: { findFirst: vi.fn().mockResolvedValue(user) },
  };
  mocks.withTenant.mockImplementation(async (_schoolId: string, callback: (client: typeof tx) => unknown) => callback(tx));
}

describe("platform account support service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantResult();
    mocks.accountLoginLockState.mockResolvedValue({ locked: false, blockedUntil: null, attemptCount: 0 });
    mocks.clearAccountLoginAttempts.mockResolvedValue(undefined);
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.appendSchoolAudit.mockResolvedValue(undefined);
    mocks.issueSchoolPasswordReset.mockResolvedValue({ universe: "school", recipient: "ama@gmail.com", token: "secret-token", expiresAt: new Date("2026-09-12T08:00:00Z"), schoolCode: "eug123" });
    mocks.deliverResetToken.mockResolvedValue(undefined);
  });

  it("checks both school and guardian account lock scopes without a shared school bucket", async () => {
    await getSchoolUserSupportState("school-1", "user-1");
    expect(mocks.accountLoginLockState).toHaveBeenCalledWith("school-login:eug123", ["ama@gmail.com", "0244000000"]);
    expect(mocks.accountLoginLockState).toHaveBeenCalledWith("guardian-login:eug123", ["ama@gmail.com", "0244000000"]);
  });

  it("lets an authorized support action clear only the selected user's login identities", async () => {
    await clearSchoolUserLoginLock("school-1", "user-1", { adminId: "admin-1", adminName: "Platform Admin" }, "Verified user identity");
    expect(mocks.clearAccountLoginAttempts).toHaveBeenCalledTimes(2);
    expect(mocks.appendPlatformAudit).toHaveBeenCalled();
  });

  it("issues an audited reset through the selected account recovery contact", async () => {
    const result = await sendSchoolUserPasswordReset("school-1", "user-1", { adminId: "admin-1", adminName: "Platform Admin" }, "User requested recovery");
    expect(mocks.issueSchoolPasswordReset).toHaveBeenCalledWith({ uniqueCode: "EUG123", identifier: "ama@gmail.com", universe: "school" });
    expect(mocks.deliverResetToken).toHaveBeenCalledTimes(1);
    expect(result.delivery).toBe("email");
  });
});
