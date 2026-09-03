import { AppShell } from "@/components/AppShell";
import PlatformWorkersConsole from "@/components/PlatformWorkersConsole";

export default function PlatformAdminsPage() {
  return (
    <AppShell
      universe="platform"
      title="Workers & Permissions"
      subtitle="Manage internal platform operators, their role capabilities, and the exact schools they can access."
      active="Workers & Permissions"
    >
      <PlatformWorkersConsole />
    </AppShell>
  );
}
