import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { PlatformSettingsWorkspace } from "@/components/PlatformSettingsWorkspace";
import PlatformControlSettingsStudio from "@/components/PlatformControlSettingsStudio";
import "@/components/platform-control-plane.css";

export default async function SettingsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "settings.manage");
  return (
    <AppShell
      universe="platform"
      active="Platform Settings"
      title="Platform Settings"
      subtitle="Configure real network defaults, security policy, tenant lifecycle, and messaging rules, while keeping public presence and governed workflows accessible."
      userName={session.name}
      role={session.role}
    >
      <PlatformControlSettingsStudio />
      <details style={{ marginTop: 24 }}>
        <summary className="app-card" style={{ padding: "15px 18px", cursor: "pointer", fontSize: 12, fontWeight: 850 }}>Public presence & legacy governed links</summary>
        <div style={{ marginTop: 12 }}><PlatformSettingsWorkspace /></div>
      </details>
    </AppShell>
  );
}
