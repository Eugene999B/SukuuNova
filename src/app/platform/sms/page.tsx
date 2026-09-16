import { AppShell } from "@/components/AppShell";
import PlatformSmsControlCenter from "@/components/PlatformSmsControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { getSmsCenterOverviewSafe } from "@/lib/platform-sms-center-overview";

export default async function PlatformSmsPage() {
  const session = await requirePlatformSession();
  const initialData = await getSmsCenterOverviewSafe(session);
  return <AppShell
    universe="platform"
    title="SMS Control Center"
    subtitle="Control SukuuNova SMS inventory, school allocations, audiences and direct sends from one audited workspace."
    active="SMS Center"
    userName={session.name}
    role={session.role}
  >
    <PlatformSmsControlCenter initialData={JSON.parse(JSON.stringify(initialData))} />
  </AppShell>;
}
