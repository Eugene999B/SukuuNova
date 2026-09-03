import PlatformControlCenter from "@/components/PlatformControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformHealth, getPlatformOverview, listPlatformAudit } from "@/lib/platform-admin-service";

export default async function PlatformPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  const [overview, health, audit, schoolScope] = await Promise.all([
    getPlatformOverview(),
    getPlatformHealth(),
    listPlatformAudit({ role: session.role, limit: 10 }),
    getPlatformSchoolScope(session),
  ]);
  const scopedSchools = schoolScope === null
    ? overview.schools
    : overview.schools.filter((school) => schoolScope.includes(String(school.id)));
  const scopedOverview = schoolScope === null
    ? overview
    : { ...overview, totals: { ...overview.totals, schools: scopedSchools.length }, schools: scopedSchools };
  return <PlatformControlCenter overview={scopedOverview} health={health} audit={audit} />;
}
