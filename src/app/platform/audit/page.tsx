import { AppShell } from "@/components/AppShell";
import PlatformAuditConsole from "@/components/PlatformAuditConsole";

export default function AuditPage() {
  return (
    <AppShell
      universe="platform"
      title="Audit Log"
      subtitle="Investigate platform actions with searchable operator, school, target and timestamp context."
      active="Audit Log"
    >
      <PlatformAuditConsole />
    </AppShell>
  );
}
