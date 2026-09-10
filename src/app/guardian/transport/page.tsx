import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GuardianTransportWorkspaceV2 } from "@/components/GuardianTransportWorkspaceV2";
import type { GuardianTransportData } from "@/components/GuardianTransportWorkspace";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { getGuardianTransportOverview } from "@/lib/novacore/family-transport-service";

export default async function GuardianTransportPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const data = await withTenant(session.schoolId, (tx) => getGuardianTransportOverview(tx, {
    schoolId: session.schoolId,
    guardianId: session.guardianId,
  }));
  const serializable = JSON.parse(JSON.stringify(data)) as GuardianTransportData;

  return <AppShell
    universe="guardian"
    title="Family Transport"
    subtitle="Live route, bus position, your pickup location, ETA and trip alerts."
    active="Transport"
    schoolName={session.schoolName}
    userName={session.name}
    role="Guardian"
  >
    <GuardianTransportWorkspaceV2 initialData={serializable}/>
  </AppShell>;
}
