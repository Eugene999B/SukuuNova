import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import SupportConsole from "./SupportConsole";

export default async function SupportPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "support.view");
  return (
    <AppShell
      universe="platform"
      title="Support"
      subtitle="Triage school issues, keep evidence attached to the case, and use time-limited audited access only when necessary."
      active="Support"
      userName={session.name}
      role={session.role}
    >
      <SupportConsole />
    </AppShell>
  );
}
