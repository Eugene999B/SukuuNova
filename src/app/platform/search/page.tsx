import { AppShell } from "@/components/AppShell";
import PlatformSearchWorkspace from "@/components/PlatformSearchWorkspace";
import "@/components/platform-search-v3.css";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function SearchPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  return (
    <AppShell
      universe="platform"
      title="Global Search"
      subtitle="Find schools, learners and school users across the network scope available to your Platform account."
      active="Global Search"
      userName={session.name}
      role={session.role}
    >
      <PlatformSearchWorkspace />
    </AppShell>
  );
}
