import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import PlatformSchoolsConsole from "@/components/PlatformSchoolsConsole";

export default async function SchoolsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const overview = await getPlatformOverview();
  return <PlatformSchoolsConsole overview={overview} />;
}
