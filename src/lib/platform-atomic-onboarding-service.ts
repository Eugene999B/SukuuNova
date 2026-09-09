import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { platformOnboardingSchema } from "./platform-onboarding-input";
import { roleKeyForName } from "./authorization";
import { permissionDescription } from "./permission-catalog";
import { hash } from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";
import { db, rawDb, withTenant } from "./db";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSIONS } from "./default-rbac";

type Input = z.input<typeof platformOnboardingSchema> & { adminId: string; adminRole: string };

export async function onboardPlatformSchool(rawInput: Input) {
  if (rawInput.adminRole !== "super_admin") throw new ForbiddenError("Only Super Admin can create new platform schools.");
  const parsed = platformOnboardingSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((issue) => issue.message).join(" "), 400, "INVALID_ONBOARDING");
  const input = { ...parsed.data, adminId: rawInput.adminId, adminRole: rawInput.adminRole };
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(uniqueCode)) throw new AppError("School code must be 3-40 lowercase letters, numbers, or hyphens.", 400, "INVALID_SCHOOL_CODE");
  if (input.ownerPassword.length < 12) throw new AppError("Owner password must contain at least 12 characters.", 400, "WEAK_PASSWORD");
  if (input.studentRate < 0 || input.flatRate < 0) throw new AppError("Billing rates cannot be negative.", 400, "INVALID_BILLING_RATE");

  const directoryDuplicate = await rawDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode }, select: { schoolId: true }
  });
  if (directoryDuplicate) {
    // A school hidden by RLS is not an orphan. Never delete its login directory.
    throw new AppError(`School login code “${uniqueCode}” is already reserved. Choose a different code.`, 409, "DUPLICATE_SCHOOL_CODE");
  }

  const permissionIds = new Map<string, string>();
  for (const key of DEFAULT_PERMISSIONS) {
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, description: permissionDescription(key) } });
    permissionIds.set(key, permission.id);
  }

  const schoolId = createId();
  const ownerPasswordHash = await hash(input.ownerPassword, 12);
  const leadership = await Promise.all(input.leadership.map(async (person) => {
    const temporaryPassword = randomBytes(24).toString("base64url");
    return { ...person, temporaryPassword, passwordHash: await hash(temporaryPassword, 12) };
  }));
  try {
    return await withTenant(schoolId, async (tx) => {
      const school = await tx.school.create({ data: { id: schoolId, uniqueCode, name: input.schoolName.trim() } });
      await tx.schoolLoginDirectory.create({ data: { schoolId, uniqueCode } });
      await tx.schoolSettings.create({
        data: {
          schoolId,
          timezone: input.timezone,
          notificationChannels: {
            schoolType: input.schoolType ?? null,
            country: input.country ?? "Ghana",
            region: input.region ?? null,
            city: input.city ?? null,
            address: input.address ?? null,
            phone: input.schoolPhone ?? null,
            email: input.schoolEmail || null,
            ownerPhone: input.ownerPhone ?? null,
          },
        },
      });

      const roleIds = new Map<string, string>();
      for (const name of DEFAULT_ROLE_NAMES) {
        const role = await tx.role.create({ data: { schoolId, name, key: roleKeyForName(name), isSystem: true } });
        roleIds.set(name, role.id);
        await tx.rolePermission.createMany({ data: [...new Set(DEFAULT_ROLE_PERMISSIONS[name])].map((key) => ({ schoolId, roleId: role.id, permissionId: permissionIds.get(key)! })) });
      }

      const owner = await tx.user.create({ data: { schoolId, name: input.ownerName.trim(), email: input.ownerEmail.trim().toLowerCase(), phone: input.ownerPhone || null, passwordHash: ownerPasswordHash, needsPasswordChange: true } });
      await tx.userRole.create({ data: { schoolId, userId: owner.id, roleId: roleIds.get("Owner")! } });

      const leadershipAccounts = [];
      for (const person of leadership) {
        const user = await tx.user.create({
          data: { schoolId, name: person.name, email: person.email, passwordHash: person.passwordHash, needsPasswordChange: true },
          select: { id: true, name: true, email: true }
        });
        await tx.userRole.create({ data: { schoolId, userId: user.id, roleId: roleIds.get(person.role)! } });
        await appendSchoolAudit(tx, {
          schoolId, actorId: owner.id, action: "user.provisioned", entityType: "User", entityId: user.id,
          after: { name: user.name, email: user.email, role: person.role, needsPasswordChange: true }
        });
        leadershipAccounts.push({ ...user, role: person.role, temporaryPassword: person.temporaryPassword });
      }


      await tx.$executeRawUnsafe(
        `INSERT INTO "PlatformSchoolBillingConfig" ("schoolId","billingMode","currency","studentRate","flatRate","billingDay","graceDays","trialDays","minimumCharge","maximumCharge","active","autoGenerateInvoices","invoiceDueDays","taxPercent","discountPercent","invoicePrefix","sendBillingNotifications","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,NULL,true,false,7,0,0,'INV',true,CURRENT_TIMESTAMP)`,
        schoolId, input.billingMode, input.currency.toUpperCase().slice(0, 8), input.studentRate, input.flatRate, input.billingDay, input.graceDays, input.trialDays,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","smsSellRate","whatsappSellRate","smsCostRate","whatsappCostRate","lowBalanceThreshold","status","updatedAt") VALUES ($1,0,0,0,0,0,0,50,'active',CURRENT_TIMESTAMP)`,
        schoolId,
      );

      await appendSchoolAudit(tx, { schoolId, actorId: owner.id, action: "school.onboarded", entityType: "School", entityId: schoolId, after: { uniqueCode, ownerId: owner.id } });
      await appendPlatformAudit({ actorId: input.adminId, action: "school.onboarded", targetSchoolId: schoolId, targetEntity: "School", meta: { uniqueCode, ownerId: owner.id, billingMode: input.billingMode, currency: input.currency, timezone: input.timezone } }, tx);
      return { school, ownerId: owner.id, leadership: leadershipAccounts, billing: { billingMode: input.billingMode, currency: input.currency, studentRate: input.studentRate, flatRate: input.flatRate, graceDays: input.graceDays, trialDays: input.trialDays }, messaging: { smsBalance: 0, whatsappBalance: 0 } };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      throw new AppError(`School login code “${uniqueCode}” is already in use. Choose a different code.`, 409, "DUPLICATE_SCHOOL_CODE");
    }
    throw error;
  }
}