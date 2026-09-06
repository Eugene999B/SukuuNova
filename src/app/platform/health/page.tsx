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
      subtitle="System health."
      active="System Health"
      userName={session.name}
      role={session.role}
    >
      <PlatformSystemHealth />
    </AppShell>
  );
}
