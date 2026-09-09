import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { PlatformSettingsWorkspace } from "@/components/PlatformSettingsWorkspace";
import PlatformControlSettingsStudio from "@/components/PlatformControlSettingsStudio";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { Activity, Building2, CreditCard, ShieldCheck, UserCog } from "lucide-react";
import "@/components/platform-control-plane.css";
import "@/components/settings-hub.css";

export default async function SettingsPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "settings.manage");

  return (
    <AppShell
      universe="platform"
      active="Platform Settings"
      title="Settings"
      subtitle="Platform rules, defaults and operator controls."
      userName={session.name}
      role={session.role}
    >
      <div className="settings-hub">
        <SettingsHero
          eyebrow="Platform administration"
          title="Control the network without hunting through technical pages."
          description="Use this page for rules that affect how SukuuNova operates across schools. Personal preferences, worker permissions and individual school controls stay in their own clearly separated areas."
          contextLabel="Signed in as"
          contextValue={session.name}
          contextMeta={session.role.replaceAll("_", " ")}
        />

        <SettingsSection title="Start here" description="Choose the kind of change you want to make.">
          <div className="settings-route-grid">
            <SettingsRouteCard href="/platform/schools" icon={Building2} title="Schools & School 360" description="Create schools, inspect individual tenants, repair school access and review school-specific issues." action="Manage schools" />
            <SettingsRouteCard href="/platform/admins" icon={UserCog} title="Platform workers & permissions" description="Control who can operate SukuuNova at platform level and what each worker is allowed to do." action="Manage platform access" />
            <SettingsRouteCard href="/platform/billing" icon={CreditCard} title="Billing & commercial rules" description="Review school billing, plans, invoices, payment status and commercial exceptions." action="Open billing" />
            <SettingsRouteCard href="/platform/health" icon={Activity} title="System health" description="Check operational health and investigate platform-level issues before changing policy." action="Review health" />
            <SettingsRouteCard href="/platform/audit" icon={ShieldCheck} title="Audit & security history" description="Review privileged actions and confirm who changed sensitive platform or school controls." action="Open audit log" />
            <SettingsRouteCard href="/account/settings" icon={UserCog} title="My workspace preferences" description="Change your own landing page, display preferences and operator alert preferences." action="Open my settings" />
          </div>
        </SettingsSection>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Network policy</span>
            <h2>Core platform defaults</h2>
            <p>These are the few settings that genuinely belong at platform level: defaults for new schools, security policy, school lifecycle controls and messaging service defaults.</p>
          </header>
          <div className="settings-focus-body">
            <PlatformControlSettingsStudio />
          </div>
        </section>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Public presence</span>
            <h2>Website, legal and public-facing settings</h2>
            <p>Keep public links and governed external information separate from operational network policy.</p>
          </header>
          <div className="settings-focus-body">
            <PlatformSettingsWorkspace />
          </div>
        </section>

        <div className="settings-hub-note">
          <strong>Use School 360 for one-school problems.</strong>
          <p>Do not change a network-wide setting to solve an issue affecting only one school. Open that school in School 360 so the action stays scoped and auditable.</p>
        </div>
      </div>
    </AppShell>
  );
}
