import { AppShell } from "@/components/AppShell";
import PlatformWorkersConsoleV3 from "@/components/PlatformWorkersConsoleV3";
import "@/components/platform-workers-v3.css";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function PlatformAdminsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "admins.view");
  return (
    <AppShell
      universe="platform"
      title="Workers & Permissions"
      subtitle="Manage accountable Platform operators, capability permissions and tenant-scope handoff."
      active="Workers & Permissions"
      userName={session.name}
      role={session.role}
    >
      <PlatformWorkersConsoleV3 />
    </AppShell>
  );
}
