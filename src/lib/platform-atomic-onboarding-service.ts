import { hash } from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";
import { db, rawDb, withTenant } from "./db";
import { appendPlatformAudit, appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSIONS } from "./default-rbac";

type Input = {
  adminId: string;
  adminRole: string;
  uniqueCode: string;
  schoolName: string;
  schoolType?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  ownerPassword: string;
  currency: string;
  billingMode: "flat" | "per_student";
  studentRate: number;
  flatRate: number;
  billingDay: number;
  graceDays: number;
  trialDays: number;
  timezone: string;
};

export async function onboardPlatformSchool(input: Input) {
  if (input.adminRole !== "super_admin") throw new ForbiddenError("Only Super Admin can create new platform schools.");
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(uniqueCode)) throw new AppError("School code must be 3-40 lowercase letters, numbers, or hyphens.", 400, "INVALID_SCHOOL_CODE");
  if (input.ownerPassword.length < 12) throw new AppError("Owner password must contain at least 12 characters.", 400, "WEAK_PASSWORD");
  if (input.studentRate < 0 || input.flatRate < 0) throw new AppError("Billing rates cannot be negative.", 400, "INVALID_BILLING_RATE");

  const [schoolDuplicate, directoryDuplicate] = await Promise.all([
    rawDb.school.findUnique({ where: { uniqueCode }, select: { id: true, name: true, status: true } }),
    rawDb.schoolLoginDirectory.findUnique({ where: { uniqueCode }, select: { schoolId: true } }),
  ]);
  if (schoolDuplicate) {
    throw new AppError(`School login code “${uniqueCode}” is already assigned to “${schoolDuplicate.name}”. Choose a different code.`, 409, "DUPLICATE_SCHOOL_CODE");
  }
  if (directoryDuplicate) {
    const directorySchool = await rawDb.school.findUnique({ where: { id: directoryDuplicate.schoolId }, select: { id: true, name: true, status: true } });
    if (directorySchool) {
      throw new AppError(`School login code “${uniqueCode}” is already reserved by “${directorySchool.name}”. Choose a different code.`, 409, "DUPLICATE_SCHOOL_CODE");
    }
    await rawDb.schoolLoginDirectory.delete({ where: { schoolId: directoryDuplicate.schoolId } });
  }

  const permissionIds = new Map<string, string>();
  for (const key of DEFAULT_PERMISSIONS) {
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, description: "SukuuNova permission: " + key } });
    permissionIds.set(key, permission.id);
  }

  const schoolId = createId();
  const ownerPasswordHash = await hash(input.ownerPassword, 12);
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
        const role = await tx.role.create({ data: { schoolId, name, key: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), isSystem: true } });
        roleIds.set(name, role.id);
        await tx.rolePermission.createMany({ data: DEFAULT_ROLE_PERMISSIONS[name].map((key) => ({ schoolId, roleId: role.id, permissionId: permissionIds.get(key)! })) });
      }

      const owner = await tx.user.create({ data: { schoolId, name: input.ownerName.trim(), email: input.ownerEmail.trim().toLowerCase(), phone: input.ownerPhone || null, passwordHash: ownerPasswordHash, needsPasswordChange: true } });
      await tx.userRole.create({ data: { schoolId, userId: owner.id, roleId: roleIds.get("Owner")! } });

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
      return { school, ownerId: owner.id, billing: { billingMode: input.billingMode, currency: input.currency, studentRate: input.studentRate, flatRate: input.flatRate, graceDays: input.graceDays, trialDays: input.trialDays }, messaging: { smsBalance: 0, whatsappBalance: 0 } };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      throw new AppError(`School login code “${uniqueCode}” is already in use. Choose a different code.`, 409, "DUPLICATE_SCHOOL_CODE");
    }
    throw error;
  }
}