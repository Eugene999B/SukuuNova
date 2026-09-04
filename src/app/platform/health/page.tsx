import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlatformSystemHealth from "@/components/PlatformSystemHealth";

export default async function HealthPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "security.manage");
  return (
    <AppShell
      universe="platform"
      title="System Health"
      subtitle="Monitor platform responsiveness and understand exactly what a lightweight health check can and cannot prove."
      active="System Health"
      userName={session.name}
      role={session.role}
    >
      <PlatformSystemHealth />
    </AppShell>
  );
}
