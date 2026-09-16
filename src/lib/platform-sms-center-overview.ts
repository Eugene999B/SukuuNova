import type { PlatformSession } from "./auth";
import { db, withTenant } from "./db";
import { AppError } from "./errors";
import { getMessagingInventory } from "./platform-messaging-inventory-service";
import { requirePlatformPermission } from "./platform-permissions";
import { getActiveSmsProviderKey, getArkeselBalanceDetails, getSmsProviderReadiness } from "./sms-provider";

async function requireSmsAdmin(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can use the SMS Control Center.", 403, "FORBIDDEN");
}

async function schoolWalletBalance(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(
      `SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 LIMIT 1`,
      schoolId,
    );
    return rows[0]?.smsBalance ?? 0;
  });
}

export async function getSmsCenterOverviewSafe(session: PlatformSession) {
  await requireSmsAdmin(session);
  const [schools, inventory, readiness, activeProvider, audits] = await Promise.all([
    // School is tenant-guarded at the Prisma model layer. This Super Admin-only
    // network overview intentionally reads only the minimal platform directory
    // fields through SQL, then re-enters each school's tenant context for wallet data.
    db.$queryRawUnsafe<Array<{ id: string; name: string; uniqueCode: string; status: string }>>(
      `SELECT "id","name","uniqueCode","status" FROM "School" ORDER BY "name" ASC`,
    ),
    getMessagingInventory(session),
    getSmsProviderReadiness(),
    getActiveSmsProviderKey(),
    db.auditLogPlatform.findMany({
      where: { action: { startsWith: "platform.sms." } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, targetSchoolId: true, targetEntity: true, meta: true, createdAt: true },
    }),
  ]);

  const schoolRows = await Promise.all(
    schools.map(async (school) => ({ ...school, smsBalance: await schoolWalletBalance(school.id) })),
  );

  // PlatformMessagingLedger is FORCE-RLS tenant data. The inventory ledger is the
  // platform-owned mirror of every allocation/refund and is safe for a network view.
  const allocationHistoryRaw = await db.$queryRawUnsafe<Array<{
    id: string;
    schoolId: string | null;
    schoolName: string | null;
    quantity: number;
    balanceAfter: number;
    reference: string | null;
    notes: string | null;
    actorId: string;
    createdAt: Date;
  }>>(
    `SELECT l."id",l."schoolId",s."name" AS "schoolName",l."quantity",l."balanceAfter",l."reference",l."notes",l."actorId",l."createdAt"
       FROM "PlatformMessagingInventoryLedger" l
       LEFT JOIN "School" s ON s."id"=l."schoolId"
      WHERE l."channel"='sms' AND l."entryType"='allocation' AND l."schoolId" IS NOT NULL
      ORDER BY l."createdAt" DESC
      LIMIT 50`,
  );
  const allocationHistory = allocationHistoryRaw.map((row) => ({
    ...row,
    schoolId: row.schoolId ?? "",
    schoolName: row.schoolName ?? "Unknown school",
    quantity: Math.abs(row.quantity),
  }));

  const providerBalance = activeProvider === "arkesel"
    ? await getArkeselBalanceDetails()
    : {
        providerKey: activeProvider,
        configured: readiness.providers.find((provider) => provider.key === activeProvider)?.configured ?? false,
        available: false,
        error: "Live balance lookup is currently available for Arkesel only.",
      };
  const smsInventory = inventory.inventory.find((row) => row.channel === "sms");

  return {
    senderId: readiness.senderId,
    activeProvider,
    providerBalance,
    platformBalance: smsInventory?.balance ?? 0,
    platformPurchased: smsInventory?.totalPurchased ?? 0,
    schools: schoolRows,
    allocatedToSchools: schoolRows.reduce((sum, school) => sum + school.smsBalance, 0),
    allocationHistory,
    sendHistory: audits,
  };
}
