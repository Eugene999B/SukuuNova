import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlatformSearchWorkspace from "@/components/PlatformSearchWorkspace";

export default async function SearchPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  return (
    <AppShell
      universe="platform"
      title="Global Search"
      subtitle="Search the schools you are authorised to support. Results stay limited to your platform-worker scope."
      active="Global Search"
      userName={session.name}
      role={session.role}
    >
      <PlatformSearchWorkspace />
    </AppShell>
  );
}
