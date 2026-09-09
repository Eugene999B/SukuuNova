"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import "./settings-hub.css";

type Settings = Record<string, Record<string, unknown>>;
type Section = "defaults" | "security" | "lifecycle" | "messaging";

const sections: Array<{ id: Section; label: string }> = [
  { id: "defaults", label: "New-school defaults" },
  { id: "security", label: "Security policy" },
  { id: "lifecycle", label: "School lifecycle" },
  { id: "messaging", label: "Messaging service" },
];

const bool = (value: unknown) => Boolean(value);

export default function PlatformControlSettingsStudio() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("defaults");

  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/control-plane?view=settings", { cache: "no-store" });
      if (response.ok) setSettings(await response.json() as Settings);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(key: string, value: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/control-plane", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "savePlatformSettings", key, value }),
      });
      const data = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? "Platform policy saved." : (data.message ?? data.error ?? "Unable to save this platform policy."));
      if (response.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <div className="settings-hub-note"><strong>Loading platform policy…</strong><p>Reading the current governed defaults.</p></div>;
  const current = settings[`platform.${section}`] ?? {};

  return (
    <div>
      {message ? <div className="settings-status-message" role="status"><CheckCircle2 size={14} aria-hidden="true" /> {message}</div> : null}

      <nav className="settings-segmented-nav" aria-label="Platform policy sections">
        {sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}>{item.label}</button>)}
      </nav>

      <div style={{ paddingTop: 20 }}>
        {section === "defaults" ? (
          <PolicySection icon={Settings2} eyebrow="New-school defaults" title="How newly provisioned schools start" description="These are starting values only. Individual schools can then configure their own operational settings where allowed.">
            <div className="settings-form-grid">
              <Field label="Default currency" value={String(current.currency ?? "GHS")} onChange={(value) => setSettings({ ...settings, "platform.defaults": { ...current, currency: value.toUpperCase() } })} />
              <Field label="Default timezone" value={String(current.timezone ?? "Africa/Accra")} onChange={(value) => setSettings({ ...settings, "platform.defaults": { ...current, timezone: value } })} />
              <Field label="Default locale" value={String(current.locale ?? "en-GH")} onChange={(value) => setSettings({ ...settings, "platform.defaults": { ...current, locale: value } })} />
              <SelectField label="Default billing model" value={String(current.defaultBillingMode ?? "flat")} onChange={(value) => setSettings({ ...settings, "platform.defaults": { ...current, defaultBillingMode: value } })} options={[{ value: "flat", label: "Flat monthly rate" }, { value: "per_student", label: "Per active student" }]} />
              <NumberField label="Default payment grace period (days)" min={0} max={90} value={Number(current.defaultGraceDays ?? 7)} onChange={(value) => setSettings({ ...settings, "platform.defaults": { ...current, defaultGraceDays: value } })} />
            </div>
            <SaveRow busy={busy} label="Save new-school defaults" onSave={() => void save("platform.defaults", settings["platform.defaults"] ?? {})} />
          </PolicySection>
        ) : null}

        {section === "security" ? (
          <PolicySection icon={ShieldCheck} eyebrow="Security policy" title="Rules for privileged platform access" description="These rules affect platform and support operations. School-specific login repair belongs in School 360.">
            <div className="settings-toggle-list">
              <Toggle checked={bool(current.requirePasswordChange)} onChange={(value) => setSettings({ ...settings, "platform.security": { ...current, requirePasswordChange: value } })} title="Require new school owners to change temporary passwords" detail="Recommended so provisioning credentials do not become permanent credentials." />
              <Toggle checked={bool(current.enableMfa)} onChange={(value) => setSettings({ ...settings, "platform.security": { ...current, enableMfa: value } })} title="Require MFA when the authentication flow supports it" detail="Platform-wide MFA policy should only be enabled when the configured authentication path can enforce it consistently." />
              <Toggle checked={bool(current.allowImpersonation)} onChange={(value) => setSettings({ ...settings, "platform.security": { ...current, allowImpersonation: value } })} title="Allow audited support impersonation" detail="Support access remains explicit, time-limited and audit logged." />
            </div>
            <div className="settings-form-grid" style={{ marginTop: 16 }}>
              <NumberField label="Maximum admin session (hours)" min={1} max={168} value={Number(current.sessionHours ?? 12)} onChange={(value) => setSettings({ ...settings, "platform.security": { ...current, sessionHours: value } })} />
              <NumberField label="Audit retention (days)" min={30} max={3650} value={Number(current.auditRetentionDays ?? 730)} onChange={(value) => setSettings({ ...settings, "platform.security": { ...current, auditRetentionDays: value } })} />
            </div>
            <SaveRow busy={busy} label="Save security policy" onSave={() => void save("platform.security", settings["platform.security"] ?? {})} />
          </PolicySection>
        ) : null}

        {section === "lifecycle" ? (
          <PolicySection icon={LockKeyhole} eyebrow="School lifecycle" title="Which tenant-control actions are available" description="These switches govern what platform operators may do to school tenants. They do not themselves lock, suspend, archive or delete a school.">
            <div className="settings-toggle-list">
              <Toggle checked={bool(current.allowLock)} onChange={(value) => setSettings({ ...settings, "platform.lifecycle": { ...current, allowLock: value } })} title="Allow restricted / locked mode" detail="Temporarily restrict access while preserving the school's data." />
              <Toggle checked={bool(current.allowSuspend)} onChange={(value) => setSettings({ ...settings, "platform.lifecycle": { ...current, allowSuspend: value } })} title="Allow school suspension" detail="Stop normal operational access without deleting historical records." />
              <Toggle checked={bool(current.allowArchive)} onChange={(value) => setSettings({ ...settings, "platform.lifecycle": { ...current, allowArchive: value } })} title="Allow archival" detail="Move a school out of normal active operations while preserving history." />
              <Toggle checked={bool(current.allowDelete)} onChange={(value) => setSettings({ ...settings, "platform.lifecycle": { ...current, allowDelete: value } })} title="Allow destructive deletion workflow" detail="Keep disabled unless retention, recovery and legal requirements are fully defined." />
            </div>
            <div className="settings-danger-note" style={{ marginTop: 16 }}>Deletion is different from suspension or archival. Prefer reversible lifecycle controls whenever possible.</div>
            <div className="settings-form-grid" style={{ marginTop: 16 }}>
              <Field label="Required delete confirmation phrase" value={String(current.requireDeletePhrase ?? "DELETE SCHOOL")} onChange={(value) => setSettings({ ...settings, "platform.lifecycle": { ...current, requireDeletePhrase: value } })} />
            </div>
            <SaveRow busy={busy} label="Save lifecycle policy" onSave={() => void save("platform.lifecycle", settings["platform.lifecycle"] ?? {})} />
          </PolicySection>
        ) : null}

        {section === "messaging" ? (
          <PolicySection icon={SlidersHorizontal} eyebrow="Messaging service" title="Network defaults for paid messaging channels" description="These settings control availability and starting thresholds for the platform messaging service. Individual school audiences and automations remain inside that school's communication workspace.">
            <div className="settings-toggle-list">
              <Toggle checked={bool(current.enableSms)} onChange={(value) => setSettings({ ...settings, "platform.messaging": { ...current, enableSms: value } })} title="Enable SMS service" detail="Allow schools to use allocated SMS capacity when their wallet and provider configuration permit it." />
              <Toggle checked={bool(current.enableWhatsapp)} onChange={(value) => setSettings({ ...settings, "platform.messaging": { ...current, enableWhatsapp: value } })} title="Enable WhatsApp service" detail="Allow schools to use allocated WhatsApp capacity when configured." />
            </div>
            <div className="settings-form-grid" style={{ marginTop: 16 }}>
              <Field label="Service currency" value={String(current.currency ?? "GHS")} onChange={(value) => setSettings({ ...settings, "platform.messaging": { ...current, currency: value.toUpperCase() } })} />
              <NumberField label="Default low-balance warning threshold" min={0} value={Number(current.lowBalanceThreshold ?? 50)} onChange={(value) => setSettings({ ...settings, "platform.messaging": { ...current, lowBalanceThreshold: value } })} />
            </div>
            <SaveRow busy={busy} label="Save messaging policy" onSave={() => void save("platform.messaging", settings["platform.messaging"] ?? {})} />
          </PolicySection>
        ) : null}
      </div>
    </div>
  );
}

function PolicySection({ icon: Icon, eyebrow, title, description, children }: { icon: typeof Settings2; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section><div className="settings-hub-section-head"><div><span className="settings-hub-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><span className="settings-route-icon"><Icon size={18} aria-hidden="true" /></span></div><div style={{ marginTop: 18 }}>{children}</div></section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="settings-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max?: number }) {
  return <label className="settings-field"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="settings-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (value: boolean) => void; title: string; detail: string }) {
  return <label className="settings-toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><strong>{title}</strong><small>{detail}</small></span></label>;
}

function SaveRow({ busy, label, onSave }: { busy: boolean; label: string; onSave: () => void }) {
  return <div className="settings-save-row"><span style={{ color: "var(--color-text-muted)", fontSize: "var(--sn-font-xs)" }}>Platform policy changes are permission-gated and audited.</span><button type="button" className="settings-primary-action" onClick={onSave} disabled={busy}>{busy ? "Saving…" : label}</button></div>;
}
