import { AppShell } from "@/components/AppShell";
import PlatformSystemHealth from "@/components/PlatformSystemHealth";

export default function HealthPage() {
  return (
    <AppShell
      universe="platform"
      title="System Health"
      subtitle="Monitor platform responsiveness and understand exactly what a lightweight health check can and cannot prove."
      active="System Health"
    >
      <PlatformSystemHealth />
    </AppShell>
  );
}
