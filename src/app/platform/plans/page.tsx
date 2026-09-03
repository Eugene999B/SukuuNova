import { AppShell } from "@/components/AppShell";
import PlanManager from "./PlanManager";

export default function PlansPage() {
  return (
    <AppShell
      universe="platform"
      title="Plans & Entitlements"
      subtitle="Design subscription packaging, review feature access, and assign the right operating capability to each school."
      active="Plans & Entitlements"
    >
      <PlanManager />
    </AppShell>
  );
}
