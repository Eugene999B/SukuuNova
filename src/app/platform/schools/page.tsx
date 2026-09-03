import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import PlatformSchoolsConsole from "@/components/PlatformSchoolsConsole";

export default async function SchoolsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const [overview, schoolScope] = await Promise.all([getPlatformOverview(), getPlatformSchoolScope(session)]);
  const scopedSchools = schoolScope === null
    ? overview.schools
    : overview.schools.filter((school) => schoolScope.includes(String(school.id)));
  const scopedOverview = schoolScope === null
    ? overview
    : { ...overview, totals: { ...overview.totals, schools: scopedSchools.length }, schools: scopedSchools };
  return (
    <AppShell
      universe="platform"
      title="Schools"
      subtitle={schoolScope === null ? "Find, inspect, support and manage every school account from a single network directory." : "Find and manage only the school accounts assigned to your platform role."}
      active="Schools"
    >
      <PlatformSchoolsConsole overview={scopedOverview} />
    </AppShell>
  );
}
