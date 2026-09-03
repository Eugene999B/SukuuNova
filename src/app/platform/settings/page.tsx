import { AppShell } from "@/components/AppShell";
import { PlatformSettingsWorkspace } from "@/components/PlatformSettingsWorkspace";

export default function SettingsPage() {
  return (
    <AppShell
      universe="platform"
      active="Platform Settings"
      title="Platform Settings"
      subtitle="Configure SukuuNova’s public presence and reach the governed workflows that control access and operations."
    >
      <PlatformSettingsWorkspace />
    </AppShell>
  );
}
