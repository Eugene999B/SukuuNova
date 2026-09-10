import { redirect } from "next/navigation";
import PlatformControlCenterClient from "@/components/PlatformControlCenterClient";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { getPlatformSchoolScope, hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformHealth, getPlatformOverview, listPlatformAudit } from "@/lib/platform-admin-service";
import { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";
import { listScopedPlatformAudit } from "@/lib/platform-scoped-audit";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import { getActiveSmsProviderKey } from "@/lib/sms-provider";
import { getSchoolStorageEstimates } from "@/lib/platform-storage-service";

const PLATFORM_LANDING_ROUTES = [
  ["analytics.view", "/platform"],
  ["schools.view", "/platform/schools"],
  ["support.view", "/platform/support"],
  ["billing.view", "/platform/billing"],
  ["admins.view", "/platform/admins"],
  ["audit.view", "/platform/audit"],
  ["settings.manage", "/platform/settings"],
  ["security.manage", "/platform/health"],
] as const;

const PROVIDER_NAMES: Record<string, string> = { arkesel: "Arkesel", sailup: "Sailup", hubtel: "Hubtel", generic: "Custom gateway" };
const providerName = (key: string) => PROVIDER_NAMES[key] ?? "Arkesel";

function schoolIdsFromOverview(overview: Awaited<ReturnType<typeof getPlatformOverview>>) {
  return overview.schools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
}

export default async function PlatformPage() {
  const session = await requirePlatformSession();
  if (session.role !== "super_admin" && !(await hasPlatformPermission(session, "analytics.view"))) {
    for (const [permission, href] of PLATFORM_LANDING_ROUTES.slice(1)) {
      if (await hasPlatformPermission(session, permission)) redirect(href);
    }
    throw new ForbiddenError("No platform workspace permission is assigned to this account.");
  }
  await requirePlatformPermission(session, "analytics.view");
  const schoolScope = await getPlatformSchoolScope(session);
  const [overview, health, intelligence] = await Promise.all([
    schoolScope === null ? getPlatformOverview() : getScopedPlatformOverview(session),
    getPlatformHealth(),
    getPlatformOwnerIntelligence({ schoolIds: schoolScope }),
  ]);
  const audit = schoolScope === null
    ? await listPlatformAudit({ role: session.role, limit: 10 })
    : await listScopedPlatformAudit(schoolScope, { limit: 10 });

  const storage = await getSchoolStorageEstimates(schoolIdsFromOverview(overview));
  const totalStorageBytes = Object.values(storage).reduce((sum, item) => sum + item.bytes, 0);

  let messaging: { smsBalance: number; smsPurchased: number; activeProvider: string } | null = null;
  if (session.role === "super_admin") {
    const [inventory, activeProvider] = await Promise.all([
      db.$queryRawUnsafe<Array<{ balance: number; totalPurchased: number }>>(`SELECT "balance","totalPurchased" FROM "PlatformMessagingInventory" WHERE "channel"='sms' LIMIT 1`),
      getActiveSmsProviderKey(),
    ]);
    messaging = {
      smsBalance: inventory[0]?.balance ?? 0,
      smsPurchased: inventory[0]?.totalPurchased ?? 0,
      activeProvider: providerName(activeProvider),
    };
  }

  return <PlatformControlCenterClient
    overview={overview}
    health={health}
    audit={audit}
    intelligence={intelligence}
    messaging={messaging}
    totalStorageBytes={totalStorageBytes}
    userName={session.name}
    role={session.role}
  />;
}
