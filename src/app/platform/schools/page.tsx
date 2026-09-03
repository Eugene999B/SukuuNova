import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import PlatformSchoolsConsole from "@/components/PlatformSchoolsConsole";

export default async function SchoolsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const overview = await getPlatformOverview();
  return (
    <AppShell
      universe="platform"
      title="Schools"
      subtitle="Find, inspect, support and manage every school account from a single network directory."
      active="Schools"
    >
      <PlatformSchoolsConsole overview={overview} />
    </AppShell>
  );
}
