import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import BillingConsole from "./BillingConsole";
import PlatformBillingStudio from "@/components/PlatformBillingStudio";
import "@/components/platform-control-plane.css";

export default async function BillingPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "billing.view");
  return (
    <AppShell
      universe="platform"
      title="Platform Billing"
      subtitle="Configure school pricing, calculate per-student bills, manage flat-rate subscriptions, and run a separate SMS/WhatsApp credit business."
      active="Platform Billing"
      userName={session.name}
      role={session.role}
    >
      <PlatformBillingStudio />
      <section className="app-card app-panel" style={{ marginTop: 24, padding: 22 }}>
        <div className="app-card-head"><div><span className="app-eyebrow">LEDGER</span><h2>Invoices & collections</h2><p>Use the operational ledger below after pricing has been configured.</p></div></div>
        <BillingConsole />
      </section>
    </AppShell>
  );
}
