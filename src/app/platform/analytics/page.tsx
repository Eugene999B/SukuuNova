import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlatformNetworkAnalytics from "@/components/PlatformNetworkAnalytics";

export default async function AnalyticsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  return (
    <AppShell
      universe="platform"
      title="Network Analytics"
      subtitle="Network analytics."
      active="Network Analytics"
      userName={session.name}
      role={session.role}
    >
      <PlatformNetworkAnalytics />
    </AppShell>
  );
}
