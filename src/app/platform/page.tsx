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
    : {
        ...overview,
        totals: {
          schools: scopedSchools.length,
          activeSchools: scopedSchools.filter((school) => school.status !== "suspended").length,
          suspendedSchools: scopedSchools.filter((school) => school.status === "suspended").length,
          students: scopedSchools.reduce((sum, school) => sum + Number(school.studentCount || 0), 0),
          users: scopedSchools.reduce((sum, school) => sum + Number(school.userCount || 0), 0),
          classes: scopedSchools.reduce((sum, school) => sum + Number(school.classCount || 0), 0),
          invoices: scopedSchools.reduce((sum, school) => sum + Number(school.invoices || 0), 0),
          unpaidInvoices: scopedSchools.reduce((sum, school) => sum + Number(school.unpaidInvoices || 0), 0),
          collected: scopedSchools.reduce((sum, school) => sum + Number(school.collected || 0), 0),
        },
        schools: scopedSchools,
      };
  return <PlatformControlCenter overview={scopedOverview} health={health} audit={audit} />;
}
