import { AppShell } from "@/components/AppShell";
import BillingConsole from "./BillingConsole";

export default function BillingPage() {
  return (
    <AppShell
      universe="platform"
      title="Platform Billing"
      subtitle="Reconcile subscriptions, invoices, collections and outstanding exposure across the schools in your platform scope."
      active="Platform Billing"
    >
      <BillingConsole />
    </AppShell>
  );
}
