import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope, hasPlatformPermission } from "@/lib/platform-permissions";
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
  const [intelligence, storageBySchool, canSecurity] = await Promise.all([
    getPlatformOwnerIntelligence({ schoolIds: schoolScope === null ? schoolIds : schoolScope }),
    getSchoolStorageEstimates(schoolIds),
    hasPlatformPermission(session, "security.manage"),
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
      {canSecurity ? <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Link href="/platform/account-control" className="app-action"><ShieldCheck size={15}/><strong>Account Control</strong></Link></div> : null}
      <PlatformSchoolsConsole overview={overview} intelligence={intelligence} storageBySchool={storageBySchool} />
    </AppShell>
  );
}
