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

async function getSchoolRows() {
  const directories = await db.schoolLoginDirectory.findMany({ orderBy: { createdAt: "desc" } });
  const rows: Array<{ id: string; name: string; uniqueCode: string; status: string; smsBalance: number }> = [];
  for (const directory of directories) {
    try {
      const row = await withTenant(directory.schoolId, async (tx) => {
        const [school, wallet] = await Promise.all([
          tx.school.findUnique({ where: { id: directory.schoolId }, select: { id: true, name: true, uniqueCode: true, status: true } }),
          tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(
            `SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 LIMIT 1`,
            directory.schoolId,
          ),
        ]);
        if (!school) return null;
        return { ...school, smsBalance: wallet[0]?.smsBalance ?? 0 };
      });
      if (row) rows.push(row);
    } catch {
      // One unavailable tenant must not hide the rest of the platform SMS directory.
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSmsCenterOverviewSafe(session: PlatformSession) {
  await requireSmsAdmin(session);
  const [schoolRows, inventory, readiness, activeProvider, audits] = await Promise.all([
    getSchoolRows(),
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

  const schoolNameById = new Map(schoolRows.map((school) => [school.id, school.name]));
  const allocationHistoryRaw = await db.$queryRawUnsafe<Array<{
    id: string;
    schoolId: string | null;
    quantity: number;
    balanceAfter: number;
    reference: string | null;
    notes: string | null;
    actorId: string;
    createdAt: Date;
  }>>(
    `SELECT "id","schoolId","quantity","balanceAfter","reference","notes","actorId","createdAt"
       FROM "PlatformMessagingInventoryLedger"
      WHERE "channel"='sms' AND "entryType"='allocation' AND "schoolId" IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 50`,
  );
  const allocationHistory = allocationHistoryRaw.map((row) => ({
    ...row,
    schoolId: row.schoolId ?? "",
    schoolName: row.schoolId ? schoolNameById.get(row.schoolId) ?? "Unknown school" : "Unknown school",
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
