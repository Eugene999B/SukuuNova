"use client";

import { useEffect, useState } from "react";
import { BellRing, Building2, CheckCircle2, Save, ShieldCheck, UserCog } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import "@/components/settings-hub.css";

type Admin = { name: string; email: string; role: string; status: string };
type Preferences = {
  defaultLanding: "/platform" | "/platform/schools" | "/platform/audit" | "/platform/billing";
  timezone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timeFormat: "12h" | "24h";
  compactInterface: boolean;
  reduceMotion: boolean;
  notifySecurity: boolean;
  notifyBilling: boolean;
  notifySupport: boolean;
  notifySystem: boolean;
};

const defaults: Preferences = {
  defaultLanding: "/platform",
  timezone: "Africa/Accra",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
  compactInterface: false,
  reduceMotion: false,
  notifySecurity: true,
  notifyBilling: true,
  notifySupport: true,
  notifySystem: true,
};

export default function PlatformAccountSettingsClient() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/account/settings", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { admin: Admin; preferences: Preferences };
      setAdmin(data.admin);
      setPrefs({ ...defaults, ...data.preferences });
    })();
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? "Your workspace preferences were saved." : (data.message ?? data.error ?? "Unable to save preferences."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell universe="platform" title="My Settings" subtitle="Personal workspace preferences, separate from platform policy." active="My Settings" userName={admin?.name ?? "Platform administrator"} role={admin?.role?.replaceAll("_", " ") ?? "Platform administrator"}>
      <div className="settings-hub">
        <SettingsHero
          eyebrow="My account"
          title="Your own workspace settings, separate from platform policy."
          description="Changes on this page affect how your administrator account behaves. They do not change schools, worker permissions or network-wide policy."
          contextLabel="Signed-in account"
          contextValue={admin?.name ?? "Platform administrator"}
          contextMeta={admin ? `${admin.email} · ${admin.role.replaceAll("_", " ")}` : "Loading account details…"}
        />

        <SettingsSection title="Related controls" description="Use the correct area for security, permissions and school-level work.">
          <div className="settings-route-grid">
            <SettingsRouteCard href="/account/security" icon={ShieldCheck} title="Security & password" description="Change your password and review account-protection controls." action="Open security" />
            <SettingsRouteCard href="/platform/admins" icon={UserCog} title="Workers & permissions" description="Manage platform-worker roles and permissions. This is not a personal preference." action="Manage workers" />
            <SettingsRouteCard href="/platform/schools" icon={Building2} title="School controls" description="Open School 360 when a setting or issue applies to one specific school." action="Open schools" />
            <SettingsRouteCard href="/platform/settings" icon={ShieldCheck} title="Platform policy" description="Change network defaults, security policy, lifecycle rules and messaging-service defaults." action="Open platform settings" />
          </div>
        </SettingsSection>

        {message ? <div className="settings-status-message" role="status"><CheckCircle2 size={14} aria-hidden="true" /> {message}</div> : null}

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Workspace</span>
            <h2>Where SukuuNova opens for you</h2>
            <p>Choose your normal starting point and how dates and time should be displayed in your administrator workspace.</p>
          </header>
          <div className="settings-focus-body">
            <div className="settings-form-grid">
              <label className="settings-field"><span>Default landing page</span><select value={prefs.defaultLanding} onChange={(event) => setPrefs({ ...prefs, defaultLanding: event.target.value as Preferences["defaultLanding"] })}><option value="/platform">Control Center</option><option value="/platform/schools">Schools</option><option value="/platform/audit">Audit Log</option><option value="/platform/billing">Platform Billing</option></select></label>
              <label className="settings-field"><span>Timezone</span><input value={prefs.timezone} onChange={(event) => setPrefs({ ...prefs, timezone: event.target.value })} /></label>
              <label className="settings-field"><span>Date format</span><select value={prefs.dateFormat} onChange={(event) => setPrefs({ ...prefs, dateFormat: event.target.value as Preferences["dateFormat"] })}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
              <label className="settings-field"><span>Time format</span><select value={prefs.timeFormat} onChange={(event) => setPrefs({ ...prefs, timeFormat: event.target.value as Preferences["timeFormat"] })}><option value="24h">24-hour</option><option value="12h">12-hour</option></select></label>
            </div>
            <div className="settings-toggle-list">
              <label className="settings-toggle-row"><input type="checkbox" checked={prefs.compactInterface} onChange={(event) => setPrefs({ ...prefs, compactInterface: event.target.checked })} /><span><strong>Compact interface</strong><small>Use denser navigation and controls when the interface supports it.</small></span></label>
              <label className="settings-toggle-row"><input type="checkbox" checked={prefs.reduceMotion} onChange={(event) => setPrefs({ ...prefs, reduceMotion: event.target.checked })} /><span><strong>Reduce motion</strong><small>Limit non-essential movement and transition effects.</small></span></label>
            </div>
          </div>
        </section>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Notifications</span>
            <h2>What should interrupt you?</h2>
            <p>Keep important operator alerts visible without turning every platform event into noise.</p>
          </header>
          <div className="settings-focus-body">
            <div className="settings-toggle-list">
              <PreferenceToggle checked={prefs.notifySecurity} onChange={(value) => setPrefs({ ...prefs, notifySecurity: value })} title="Security alerts" detail="Authentication, privileged actions and access changes." />
              <PreferenceToggle checked={prefs.notifyBilling} onChange={(value) => setPrefs({ ...prefs, notifyBilling: value })} title="Billing alerts" detail="Invoices, payments and commercial exceptions." />
              <PreferenceToggle checked={prefs.notifySupport} onChange={(value) => setPrefs({ ...prefs, notifySupport: value })} title="Support alerts" detail="Urgent school-support cases and unresolved queues." />
              <PreferenceToggle checked={prefs.notifySystem} onChange={(value) => setPrefs({ ...prefs, notifySystem: value })} title="System alerts" detail="Application health, background jobs and operational incidents." />
            </div>
            <div className="settings-save-row">
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--color-text-muted)", fontSize: "var(--sn-font-xs)" }}><BellRing size={14} aria-hidden="true" /> Preferences apply only to this operator account.</span>
              <button type="button" className="settings-primary-action" onClick={() => void save()} disabled={busy}><Save size={14} aria-hidden="true" /> {busy ? "Saving…" : "Save my preferences"}</button>
            </div>
          </div>
        </section>

        <div className="settings-hub-note">
          <strong>Account settings are not access control.</strong>
          <p>Your worker permissions and school scope are governed separately so changing a personal preference can never accidentally increase your authority.</p>
        </div>
      </div>
    </AppShell>
  );
}

function PreferenceToggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (value: boolean) => void; title: string; detail: string }) {
  return <label className="settings-toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><strong>{title}</strong><small>{detail}</small></span></label>;
}
