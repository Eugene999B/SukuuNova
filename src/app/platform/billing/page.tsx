import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission, getPlatformSchoolScope } from "@/lib/platform-permissions";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import PlatformBillingHub from "./PlatformBillingHub";
import "@/components/platform-control-plane.css";

export default async function BillingPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "billing.view");
  const scope = await getPlatformSchoolScope(session);
  const overview = scope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session);
  const schools = overview.schools.map((school) => ({ id: String(school.id), name: String(school.name), uniqueCode: String(school.uniqueCode) }));
  return <AppShell universe="platform" title="Platform Billing" subtitle="A guided commercial workspace for school subscriptions, invoices, collections and prepaid communications capacity." active="Platform Billing" userName={session.name} role={session.role}>
    <PlatformBillingHub schools={schools} />
  </AppShell>;
}
