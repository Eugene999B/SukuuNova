import { AppShell } from "@/components/AppShell";
import SupportConsole from "./SupportConsole";

export default function SupportPage() {
  return (
    <AppShell
      universe="platform"
      title="Support"
      subtitle="Triage school issues, keep evidence attached to the case, and use time-limited audited access only when necessary."
      active="Support"
    >
      <SupportConsole />
    </AppShell>
  );
}
