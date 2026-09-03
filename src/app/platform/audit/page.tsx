import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlatformAuditConsole from "@/components/PlatformAuditConsole";

export default async function AuditPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "audit.view");
  return (
    <AppShell
      universe="platform"
      title="Audit Log"
      subtitle="Investigate platform actions with searchable operator, school, target and timestamp context."
      active="Audit Log"
      userName={session.name}
      role={session.role}
    >
      <PlatformAuditConsole />
    </AppShell>
  );
}
