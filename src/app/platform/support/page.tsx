import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import SupportConsole from "./SupportConsole";
import "./platform-support-v3.css";

export default async function SupportPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "support.view");
  return (
    <AppShell
      universe="platform"
      title="Support"
      subtitle="Resolve school support cases with full tenant context and audited temporary access."
      active="Support"
      userName={session.name}
      role={session.role}
    >
      <SupportConsole />
    </AppShell>
  );
}
