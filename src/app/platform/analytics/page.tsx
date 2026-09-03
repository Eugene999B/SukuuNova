import { AppShell } from "@/components/AppShell";
import PlatformNetworkAnalytics from "@/components/PlatformNetworkAnalytics";

export default function AnalyticsPage() {
  return (
    <AppShell
      universe="platform"
      title="Network Analytics"
      subtitle="Compare operational health, adoption, attendance and commercial signals across the SukuuNova network."
      active="Network Analytics"
    >
      <PlatformNetworkAnalytics />
    </AppShell>
  );
}
