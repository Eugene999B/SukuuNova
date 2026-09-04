import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { PlatformSettingsWorkspace } from "@/components/PlatformSettingsWorkspace";

export default async function SettingsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "settings.manage");
  return (
    <AppShell
      universe="platform"
      active="Platform Settings"
      title="Platform Settings"
      subtitle="Configure SukuuNova’s public presence and reach the governed workflows that control access and operations."
      userName={session.name}
      role={session.role}
    >
      <PlatformSettingsWorkspace />
    </AppShell>
  );
}
