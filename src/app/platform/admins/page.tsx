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
      subtitle="Operators and permissions."
      active="Workers & Permissions"
      userName={session.name}
      role={session.role}
    >
      <PlatformWorkersConsole />
    </AppShell>
  );
}
