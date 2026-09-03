import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import BillingConsole from "./BillingConsole";

export default async function BillingPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "billing.view");
  return (
    <AppShell
      universe="platform"
      title="Platform Billing"
      subtitle="Reconcile subscriptions, invoices, collections and outstanding exposure across the schools in your platform scope."
      active="Platform Billing"
      userName={session.name}
      role={session.role}
    >
      <BillingConsole />
    </AppShell>
  );
}
