import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlatformWorkersConsole from "@/components/PlatformWorkersConsole";

export default async function PlatformAdminsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "admins.view");
  return (
    <AppShell
      universe="platform"
      title="Workers & Permissions"
      subtitle="Manage internal platform operators, their role capabilities, and the exact schools they can access."
      active="Workers & Permissions"
      userName={session.name}
      role={session.role}
    >
      <PlatformWorkersConsole />
    </AppShell>
  );
}
