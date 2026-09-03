import PlatformControlCenter from "@/components/PlatformControlCenter";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { requirePlatformSession, getPlatformHealth } from "@/lib/auth";
import { getPlatformOverview, listPlatformAudit } from "@/lib/platform-admin-service";

export default async function PlatformPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  const [overview, health, audit] = await Promise.all([
    getPlatformOverview(),
    getPlatformHealth(),
    listPlatformAudit(session.role, 10),
  ]);
  return <PlatformControlCenter overview={overview} health={health} audit={audit} />;
}
