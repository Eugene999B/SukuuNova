import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { onboardPlatformSchool } from "../src/lib/platform-atomic-onboarding-service";
import { platformOnboardingSchema } from "../src/lib/platform-onboarding-input";
import { withTenant } from "../src/lib/db";
import { rawDb } from "./helpers";

function input() {
  return {
    adminId: createId(), adminRole: "super_admin",
    uniqueCode: "onboard-" + createId(), schoolName: "Provisioned School",
    ownerName: "School Owner", ownerEmail: "owner@example.invalid",
    ownerPassword: randomBytes(24).toString("base64url"),
    timezone: "Africa/Accra", currency: "GHS", billingMode: "flat" as const,
    flatRate: 25, studentRate: 0, billingDay: 1, graceDays: 7, trialDays: 14,
    leadership: [
      { role: "Principal" as const, name: "School Principal", email: "principal@example.invalid" },
      { role: "Administrator" as const, name: "School Administrator", email: "administrator@example.invalid" }
    ]
  };
}

describe("atomic school leadership provisioning", () => {
  it("creates leadership, forced-password access, settings, billing, wallet and audit records together", async () => {
    const request = input();
    const result = await onboardPlatformSchool(request);
    expect(result.leadership).toHaveLength(2);
    expect(new Set(result.leadership.map((person) => person.temporaryPassword)).size).toBe(2);
    await withTenant(result.school.id, async (tx) => {
      const users = await tx.user.findMany({ include: { userRoles: { include: { role: true } } } });
      expect(users).toHaveLength(3);
      expect(users.every((user) => user.needsPasswordChange)).toBe(true);
      for (const person of result.leadership) {
        const saved = users.find((user) => user.id === person.id)!;
        expect(saved.userRoles.map(({ role }) => role.key)).toEqual([person.role.toLowerCase()]);
        expect(person.temporaryPassword.length).toBeGreaterThanOrEqual(24);
        expect(await compare(person.temporaryPassword, saved.passwordHash)).toBe(true);
      }
      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId: result.school.id } });
      expect(settings.timezone).toBe("Africa/Accra");
      const directory = await tx.schoolLoginDirectory.findUniqueOrThrow({ where: { schoolId: result.school.id } });
      expect(directory.uniqueCode).toBe(request.uniqueCode);
      const billing = await tx.$queryRawUnsafe<Array<{ flatRate: unknown }>>(
        'SELECT "flatRate" FROM "PlatformSchoolBillingConfig" WHERE "schoolId" = $1', result.school.id
      );
      expect(Number(billing[0].flatRate)).toBe(25);
      const wallet = await tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(
        'SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId" = $1', result.school.id
      );
      expect(Number(wallet[0].smsBalance)).toBe(0);
      const audits = await tx.auditLogSchool.findMany();
      expect(audits.filter((audit) => audit.action === "user.provisioned")).toHaveLength(2);
      for (const person of result.leadership) expect(JSON.stringify(audits)).not.toContain(person.temporaryPassword);
    });
    await expect(onboardPlatformSchool(request)).rejects.toMatchObject({ status: 409 });
    const preservedDirectory = await rawDb.schoolLoginDirectory.findUniqueOrThrow({ where: { uniqueCode: request.uniqueCode } });
    expect(preservedDirectory.schoolId).toBe(result.school.id);
    const audit = await rawDb.auditLogPlatform.findFirst({ where: { targetSchoolId: result.school.id, action: "school.onboarded" } });
    expect(audit).not.toBeNull();
    for (const person of result.leadership) expect(JSON.stringify(audit)).not.toContain(person.temporaryPassword);
  });

  it("rejects duplicate account emails before creating a tenant", async () => {
    const request = input();
    request.leadership[0].email = " OWNER@example.invalid ";
    await expect(onboardPlatformSchool(request)).rejects.toMatchObject({ status: 400 });
    expect(await rawDb.schoolLoginDirectory.findUnique({ where: { uniqueCode: request.uniqueCode } })).toBeNull();
  });

  it("rejects invalid timezone, repeated leadership roles and non-finite billing rates", () => {
    expect(platformOnboardingSchema.safeParse({ ...input(), timezone: "Not/A_Timezone" }).success).toBe(false);
    const request = input();
    expect(platformOnboardingSchema.safeParse({ ...request, leadership: [request.leadership[0], { ...request.leadership[0], email: "second@example.invalid" }] }).success).toBe(false);
    expect(platformOnboardingSchema.safeParse({ ...input(), flatRate: Infinity }).success).toBe(false);
  });

  it("restricts school provisioning to platform super administrators", async () => {
    await expect(onboardPlatformSchool({ ...input(), adminRole: "support" })).rejects.toMatchObject({ status: 403 });
  });
});
