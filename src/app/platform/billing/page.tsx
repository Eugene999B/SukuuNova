import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import BillingConsole from "./BillingConsole";
import PlatformBillingStudio from "@/components/PlatformBillingStudio";
import PlatformMessagingInventoryStudio from "@/components/PlatformMessagingInventoryStudio";
import PlatformInvoiceActions from "@/components/PlatformInvoiceActions";
import PlatformAdvancedBillingRules from "@/components/PlatformAdvancedBillingRules";
import "@/components/platform-control-plane.css";

export default async function BillingPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "billing.view");
  const scope = await getPlatformSchoolScope(session);
  const overview = scope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session);
  const schools = overview.schools.map((school) => ({ id: String(school.id), name: String(school.name), uniqueCode: String(school.uniqueCode) }));
  return (
    <AppShell universe="platform" title="Platform Billing" subtitle="Configure school pricing, calculate per-student bills, manage flat-rate subscriptions, control due terms and automation, and run a separate SMS/WhatsApp credit business." active="Platform Billing" userName={session.name} role={session.role}>
      <PlatformBillingStudio />
      <PlatformMessagingInventoryStudio />
      <PlatformAdvancedBillingRules schools={schools} />
      <PlatformInvoiceActions schools={schools} />
      <section className="app-card app-panel" style={{ marginTop: 24, padding: 22 }}>
        <div className="app-card-head"><div><span className="app-eyebrow">LEDGER</span><h2>Invoices & collections</h2><p>Use the operational ledger below after pricing and due terms have been configured.</p></div></div>
        <BillingConsole />
      </section>
    </AppShell>
  );
}
