import PlatformControlCenter from "@/components/PlatformControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformHealth, getPlatformOverview, listPlatformAudit } from "@/lib/platform-admin-service";
import { listScopedPlatformAudit } from "@/lib/platform-scoped-audit";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";

export default async function PlatformPage() {
  const session = await requirePlatformSession();
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
