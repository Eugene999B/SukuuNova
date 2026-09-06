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
      subtitle="Support desk."
      active="Support"
      userName={session.name}
      role={session.role}
    >
      <SupportConsole />
    </AppShell>
  );
}
