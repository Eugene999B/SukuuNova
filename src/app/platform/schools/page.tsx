import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import PlatformSchoolsConsole from "@/components/PlatformSchoolsConsole";

export default async function SchoolsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const schoolScope = await getPlatformSchoolScope(session);
  const overview = schoolScope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session);
  return (
    <AppShell
      universe="platform"
      title="Schools"
      subtitle={schoolScope === null ? "Find, inspect, support and manage every school account from a single network directory." : "Find and manage only the school accounts assigned to your platform role."}
      active="Schools"
    >
      <PlatformSchoolsConsole overview={overview} />
    </AppShell>
  );
}
