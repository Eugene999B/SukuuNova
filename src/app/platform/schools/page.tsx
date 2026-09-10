import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import { getPlatformOwnerIntelligence } from "@/lib/platform-owner-intelligence";
import { getSchoolStorageEstimates } from "@/lib/platform-storage-service";
import PlatformSchoolsConsole from "@/components/PlatformSchoolsConsole";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const schoolScope = await getPlatformSchoolScope(session);
  const overview = schoolScope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session);
  const schoolIds = overview.schools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
  const [intelligence, storageBySchool] = await Promise.all([
    getPlatformOwnerIntelligence({ schoolIds: schoolScope === null ? schoolIds : schoolScope }),
    getSchoolStorageEstimates(schoolIds),
  ]);

  return (
    <AppShell
      universe="platform"
      title="School Network"
      subtitle={schoolScope === null ? "Find a school, understand its condition and open the complete operational workspace." : "Your assigned school network and operational context."}
      active="Schools"
      userName={session.name}
      role={session.role}
    >
      <PlatformSchoolsConsole overview={overview} intelligence={intelligence} storageBySchool={storageBySchool} />
    </AppShell>
  );
}
