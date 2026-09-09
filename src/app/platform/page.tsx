import Link from "next/link";
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

const providerName = (key: string) => ({ arkesel: "Arkesel", sailup: "Sailup", hubtel: "Hubtel", generic: "Custom gateway" }[key] ?? "Arkesel");

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

  return <div className="space-y-5">
    {messaging ? <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-700">Platform SMS inventory</span>
          <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div><strong className="block text-3xl font-black text-slate-950">{messaging.smsBalance.toLocaleString()}</strong><span className="text-[10px] font-semibold text-slate-500">SMS units available to sell / allocate</span></div>
            <div><strong className="block text-sm font-black text-slate-900">{messaging.activeProvider}</strong><span className="text-[10px] text-slate-500">active delivery provider</span></div>
            <div><strong className="block text-sm font-black text-slate-900">{messaging.smsPurchased.toLocaleString()}</strong><span className="text-[10px] text-slate-500">provider units purchased lifetime</span></div>
          </div>
        </div>
        <Link href="/platform/billing" className="rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black text-white">Manage & allocate SMS credits</Link>
      </div>
    </section> : null}
    <PlatformControlCenterClient overview={overview} health={health} audit={audit} intelligence={intelligence} />
  </div>;
}
