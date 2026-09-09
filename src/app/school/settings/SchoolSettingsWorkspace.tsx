"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import "@/components/settings-hub.css";

type Settings = {
  expectedResumptionTime: string;
  attendanceGraceMinutes: number;
  timezone: string;
  gradeCaWeight: number | string;
  gradeExamWeight: number | string;
  allowPartialReportCards: boolean;
  smsSenderId?: string | null;
};

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "current" | "completed";
  academicYear: { id: string; name: string; startDate: string; endDate: string };
};

type Data = {
  school: { id: string; name: string; uniqueCode: string; status: string };
  settings: Settings | null;
  academicYears: { id: string; name: string; startDate: string; endDate: string }[];
  terms: Term[];
};

type Section = "profile" | "attendance" | "academic" | "communication";

const defaults: Settings = {
  expectedResumptionTime: "07:30",
  attendanceGraceMinutes: 15,
  timezone: "Africa/Accra",
  gradeCaWeight: 40,
  gradeExamWeight: 60,
  allowPartialReportCards: false,
  smsSenderId: "",
};

const sections: Array<{ id: Section; label: string }> = [
  { id: "profile", label: "School profile" },
  { id: "attendance", label: "Attendance & time" },
  { id: "academic", label: "Academic defaults" },
  { id: "communication", label: "Communication" },
];

const iso = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function SchoolSettingsWorkspace({ initial, dataSession }: { initial: Data; dataSession: { name: string } }) {
  const [section, setSection] = useState<Section>("profile");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [school, setSchool] = useState(initial.school);
  const [settings, setSettings] = useState<Settings>(initial.settings ?? defaults);
  const currentTerm = useMemo(
    () => initial.terms.find((term) => term.status === "current") ?? initial.terms.find((term) => term.status === "upcoming") ?? initial.terms[0],
    [initial.terms],
  );
  const weightTotal = Number(settings.gradeCaWeight) + Number(settings.gradeExamWeight);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school: { ...school, uniqueCode: initial.school.uniqueCode }, settings }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Unable to save settings.");
      setMessage("School settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-focus-panel">
      <header>
        <span className="settings-hub-eyebrow">Core school settings</span>
        <h2>Change the defaults that affect everyday school work</h2>
        <p>Only genuine school-wide defaults live here. Roles, terms, report design and other specialist settings are opened from the Settings Home above.</p>
      </header>

      <nav className="settings-segmented-nav" aria-label="School settings sections">
        {sections.map((item) => (
          <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-focus-body">
        {message ? <div className="settings-status-message" role="status">{message}</div> : null}

        {section === "profile" ? (
          <div>
            <div className="settings-form-grid">
              <Field label="School name" value={school.name} onChange={(value) => setSchool({ ...school, name: value })} />
              <ReadOnly label="School login code" value={school.uniqueCode} />
              <ReadOnly label="School status" value={school.status} />
              <ReadOnly label="Signed-in administrator" value={dataSession.name} />
            </div>
            <div className="settings-danger-note" style={{ marginTop: 16 }}>
              The school login code is permanent after provisioning because it is used by guardian links, identity cards and QR-based workflows. Change the school name here; use the reporting and appearance settings for logos and document presentation.
            </div>
          </div>
        ) : null}

        {section === "attendance" ? (
          <div>
            <div className="settings-form-grid">
              <Field label="Timezone" value={settings.timezone} onChange={(value) => setSettings({ ...settings, timezone: value })} />
              <Field label="Expected school arrival time" type="time" value={settings.expectedResumptionTime} onChange={(value) => setSettings({ ...settings, expectedResumptionTime: value })} />
              <Field label="Late grace period (minutes)" type="number" value={String(settings.attendanceGraceMinutes)} onChange={(value) => setSettings({ ...settings, attendanceGraceMinutes: Number(value) })} />
              <ReadOnly label="Current / next term" value={currentTerm ? `${currentTerm.name} · ${iso(currentTerm.startDate)} to ${iso(currentTerm.endDate)}` : "No term configured"} />
            </div>
            <div className="settings-save-row">
              <span className="settings-hub-note"><strong>Term dates and holidays are managed separately.</strong><p>Calendar dates drive attendance denominators, report cards and other term-aware workflows.</p></span>
              <Link href="/school/terms" className="settings-secondary-action">Open terms & calendar</Link>
            </div>
          </div>
        ) : null}

        {section === "academic" ? (
          <div>
            <div className="settings-form-grid">
              <Field label="Continuous assessment weight (%)" type="number" value={String(settings.gradeCaWeight)} onChange={(value) => setSettings({ ...settings, gradeCaWeight: Number(value) })} />
              <Field label="Exam weight (%)" type="number" value={String(settings.gradeExamWeight)} onChange={(value) => setSettings({ ...settings, gradeExamWeight: Number(value) })} />
              <ReadOnly label="Combined weighting" value={`${weightTotal}%`} />
            </div>
            <div className="settings-toggle-list">
              <Toggle label="Allow partial report cards" detail="Allow authorised staff to publish a report while some eligible subject results are still missing." checked={settings.allowPartialReportCards} onChange={(value) => setSettings({ ...settings, allowPartialReportCards: value })} />
            </div>
            {weightTotal !== 100 ? <div className="settings-danger-note" style={{ marginTop: 16 }}>CA and Exam weights should add up to 100%. Review the values before saving.</div> : null}
            <div className="settings-save-row">
              <span />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/school/academics/setup" className="settings-secondary-action">Academic setup</Link>
                <Link href="/school/settings/reporting" className="settings-secondary-action">Report-card settings</Link>
              </div>
            </div>
          </div>
        ) : null}

        {section === "communication" ? (
          <div>
            <div className="settings-form-grid">
              <Field label="SMS sender ID" value={settings.smsSenderId ?? ""} onChange={(value) => setSettings({ ...settings, smsSenderId: value })} />
            </div>
            <div className="settings-hub-note" style={{ marginTop: 16 }}>
              <strong>Messaging rules belong in the communication centre.</strong>
              <p>This page stores the school sender identity. Audiences, delivery channels, automations and message history stay together in Communications.</p>
            </div>
            <div className="settings-save-row">
              <span />
              <Link href="/school/communications/settings" className="settings-secondary-action">Open communication settings</Link>
            </div>
          </div>
        ) : null}

        <div className="settings-save-row">
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--sn-font-xs)" }}>Changes here apply school-wide.</span>
          <button type="button" className="settings-primary-action" onClick={() => void save()} disabled={busy || weightTotal !== 100}>
            <Save size={14} aria-hidden="true" /> {busy ? "Saving…" : "Save school settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="settings-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="settings-readonly"><span>{label}</span><strong>{value}</strong></div>;
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong><small>{detail}</small></span></label>;
}
