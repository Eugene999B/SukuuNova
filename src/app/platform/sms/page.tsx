import Link from "next/link";
import { History } from "lucide-react";
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
    subtitle="Manage school SMS allocations separately from Super Admin direct SMS, which uses the live provider balance."
    active="SMS Center"
    userName={session.name}
    role={session.role}
  >
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <Link href="/platform/sms/history" className="app-action"><History size={15}/><strong>SMS History</strong></Link>
    </div>
    <PlatformSmsControlCenter initialData={JSON.parse(JSON.stringify(initialData))} />
  </AppShell>;
}