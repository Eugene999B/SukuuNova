import { redirect } from "next/navigation";
import PlatformControlCenter from "@/components/PlatformControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformSchoolScope, hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformHealth, getPlatformOverview, listPlatformAudit } from "@/lib/platform-admin-service";
import { listScopedPlatformAudit } from "@/lib/platform-scoped-audit";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";

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

export default async function PlatformPage() {
  const session = await requirePlatformSession();
  if (session.role !== "super_admin" && !(await hasPlatformPermission(session, "analytics.view"))) {
    for (const [permission, href] of PLATFORM_LANDING_ROUTES.slice(1)) {
      if (await hasPlatformPermission(session, permission)) redirect(href);
    }
    throw new Error("No platform workspace permission is assigned to this account.");
  }
  await requirePlatformPermission(session, "analytics.view");
  const schoolScope = await getPlatformSchoolScope(session);
  const [overview, health] = await Promise.all([
    schoolScope === null ? getPlatformOverview() : getScopedPlatformOverview(session),
    getPlatformHealth(),
  ]);
  const audit = schoolScope === null
    ? await listPlatformAudit({ role: session.role, limit: 10 })
    : await listScopedPlatformAudit(schoolScope, { limit: 10 });
  return <PlatformControlCenter overview={overview} health={health} audit={audit} />;
}
