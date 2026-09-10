import { AppShell } from "@/components/AppShell";
import PlatformNetworkAnalytics from "@/components/PlatformNetworkAnalytics";
import "@/components/platform-network-analytics-v3.css";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function AnalyticsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  return (
    <AppShell
      universe="platform"
      title="Network Analytics"
      subtitle="Compare school health, attendance, activity and commercial exposure across the network."
      active="Network Analytics"
      userName={session.name}
      role={session.role}
    >
      <PlatformNetworkAnalytics />
    </AppShell>
  );
}
