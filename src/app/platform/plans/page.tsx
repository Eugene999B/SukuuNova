import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import PlanManager from "./PlanManager";

export default async function PlansPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "plans.manage");
  return (
    <AppShell
      universe="platform"
      title="Plans & Entitlements"
      subtitle="Plans and entitlements."
      active="Plans & Entitlements"
      userName={session.name}
      role={session.role}
    >
      <PlanManager />
    </AppShell>
  );
}
