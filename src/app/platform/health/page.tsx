import { AppShell } from "@/components/AppShell";
import PlatformSystemHealth from "@/components/PlatformSystemHealth";
import "@/components/platform-system-health-v3.css";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function HealthPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "security.manage");
  return (
    <AppShell
      universe="platform"
      title="System Health"
      subtitle="Verify the control plane, database and application route before a school-facing incident develops."
      active="System Health"
      userName={session.name}
      role={session.role}
    >
      <PlatformSystemHealth />
    </AppShell>
  );
}
