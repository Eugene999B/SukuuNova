"use client";

import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  ImagePlus,
  MessageSquareText,
  School2,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";

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
  school: { id: string; name: string; uniqueCode: string; status: string; logoUrl: string | null };
  settings: Settings | null;
  academicYears: { id: string; name: string; startDate: string; endDate: string }[];
  terms: Term[];
};

const defaults: Settings = {
  expectedResumptionTime: "07:30",
  attendanceGraceMinutes: 15,
  timezone: "Africa/Accra",
  gradeCaWeight: 40,
  gradeExamWeight: 60,
  allowPartialReportCards: false,
  smsSenderId: "",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function SchoolSettingsWorkspace({ initial }: { initial: Data }) {
  const [school, setSchool] = useState(initial.school);
  const [settings, setSettings] = useState<Settings>(initial.settings ?? defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  const currentTerm = useMemo(
    () => initial.terms.find((term) => term.status === "current") ?? initial.terms.find((term) => term.status === "upcoming") ?? initial.terms[0],
    [initial.terms],
  );
  const weightTotal = Number(settings.gradeCaWeight) + Number(settings.gradeExamWeight);
  const gradingReady = Math.abs(weightTotal - 100) < 0.001;

  const save = async () => {
    if (!gradingReady) {
      setMessageKind("error");
      setMessage("Continuous assessment and exam weights must add up to 100% before you save.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school: { name: school.name, logoUrl: school.logoUrl },
          settings: {
            ...settings,
            gradeCaWeight: Number(settings.gradeCaWeight),
            gradeExamWeight: Number(settings.gradeExamWeight),
            attendanceGraceMinutes: Number(settings.attendanceGraceMinutes),
            smsSenderId: settings.smsSenderId?.trim() || "",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save school settings.");
      if (payload.school) {
        setSchool((current) => ({ ...current, name: payload.school.name, logoUrl: payload.school.logoUrl ?? current.logoUrl }));
      }
      setMessageKind("success");
      setMessage("School settings saved. These defaults now apply across SukuuNova.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Unable to save school settings.");
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessageKind("error");
      setMessage("Use a PNG, JPG or WebP image for the school logo.");
      event.target.value = "";
      return;
    }
    if (file.size > 1_000_000) {
      setMessageKind("error");
      setMessage("The school logo must be 1 MB or smaller.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setSchool((current) => ({ ...current, logoUrl: reader.result as string }));
      setMessage("");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="school-settings-simple">
      <header className="school-settings-titlebar">
        <div>
          <span className="settings-label">SCHOOL-WIDE SETTINGS</span>
          <h1>Set up the school once, then let every module use the same rules.</h1>
          <p>Only settings that affect the whole school live here. Personal theme preferences belong to your own account settings.</p>
        </div>
        <button className="settings-save" type="button" onClick={() => void save()} disabled={busy || !gradingReady}>
          {busy ? "Saving…" : "Save school settings"}
        </button>
      </header>

      {message ? <div className={`settings-feedback ${messageKind}`}>{message}</div> : null}

      <nav className="settings-jump" aria-label="School settings sections">
        <a href="#school-profile">School profile</a>
        <a href="#school-day">School day</a>
        <a href="#academics">Academics</a>
        <a href="#people-access">People & access</a>
        <a href="#communication-documents">Communication & documents</a>
      </nav>

      <section id="school-profile" className="settings-panel">
        <div className="settings-panel-heading">
          <div className="settings-step-icon"><School2 size={20} /></div>
          <div><span>1 · SCHOOL PROFILE</span><h2>Your official school identity</h2><p>This name and logo are reused on report cards, timetable prints, ID cards, receipts and other official documents.</p></div>
        </div>
        <div className="school-profile-grid">
          <div className="school-logo-editor">
            <div className="school-logo-preview">
              {school.logoUrl ? <img src={school.logoUrl} alt={`${school.name} logo`} /> : <School2 size={34} />}
            </div>
            <div>
              <strong>School logo</strong>
              <p>Use a clear square or crest-style PNG, JPG or WebP. Maximum 1 MB.</p>
              <label className="settings-upload">
                <ImagePlus size={15} /> Choose logo
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} />
              </label>
              {school.logoUrl ? <button className="settings-text-button" type="button" onClick={() => setSchool((current) => ({ ...current, logoUrl: null }))}>Remove logo</button> : null}
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="settings-field"><span>School name</span><input value={school.name} onChange={(event) => setSchool((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className="settings-readonly"><span>School code</span><strong>{school.uniqueCode}</strong><small>This permanent code protects guardian links, ID/QR references and integrations.</small></div>
            <div className="settings-readonly"><span>School account</span><strong>{school.status}</strong><small>Platform-controlled account status.</small></div>
          </div>
        </div>
      </section>

      <section id="school-day" className="settings-panel">
        <div className="settings-panel-heading">
          <div className="settings-step-icon"><Clock3 size={20} /></div>
          <div><span>2 · SCHOOL DAY & ATTENDANCE</span><h2>Set the normal arrival rules</h2><p>These simple defaults are used by attendance summaries. Fingerprint, face, QR opening/closing windows and device rules are configured in Attendance Control.</p></div>
        </div>
        <div className="settings-form-grid three">
          <label className="settings-field"><span>Expected arrival time</span><input type="time" value={settings.expectedResumptionTime} onChange={(event) => setSettings((current) => ({ ...current, expectedResumptionTime: event.target.value }))} /><small>Example: 07:30 means learners/staff are expected by 7:30 AM.</small></label>
          <label className="settings-field"><span>Late grace period</span><div className="settings-input-suffix"><input type="number" min="0" max="180" value={settings.attendanceGraceMinutes} onChange={(event) => setSettings((current) => ({ ...current, attendanceGraceMinutes: Number(event.target.value) }))} /><b>minutes</b></div><small>After this grace period, attendance can be classified as late.</small></label>
          <label className="settings-field"><span>School timezone</span><input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} /><small>Ghana schools normally use Africa/Accra.</small></label>
        </div>
        <div className="settings-action-row">
          <SettingsLink icon={<Smartphone size={18} />} title="Attendance & Devices" detail="Configure fingerprint, face, rotating QR, opening/closing windows and manual registers." href="/school/devices" />
          <SettingsLink icon={<CalendarDays size={18} />} title="School calendar & holidays" detail="Set term dates, holidays and non-school days used by attendance and reports." href="/school/calendar" />
        </div>
      </section>

      <section id="academics" className="settings-panel">
        <div className="settings-panel-heading">
          <div className="settings-step-icon"><GraduationCap size={20} /></div>
          <div><span>3 · ACADEMICS</span><h2>Academic year, grading and reporting defaults</h2><p>Keep the everyday academic rules here. Detailed class, subject, teacher and timetable setup stays inside Academic Setup.</p></div>
        </div>
        <div className="settings-current-term">
          <div><span>Current / next term</span><strong>{currentTerm?.name ?? "No term configured"}</strong><small>{currentTerm ? `${currentTerm.academicYear.name} · ${dateLabel(currentTerm.startDate)} – ${dateLabel(currentTerm.endDate)}` : "Create an academic year and terms before entering results."}</small></div>
          <Link href="/school/terms">Manage academic year & terms <ChevronRight size={15} /></Link>
        </div>
        <div className="settings-form-grid three">
          <label className="settings-field"><span>Continuous assessment</span><div className="settings-input-suffix"><input type="number" min="0" max="100" value={settings.gradeCaWeight} onChange={(event) => setSettings((current) => ({ ...current, gradeCaWeight: Number(event.target.value) }))} /><b>%</b></div><small>Contribution of classwork, homework, quizzes and other CA.</small></label>
          <label className="settings-field"><span>Terminal examination</span><div className="settings-input-suffix"><input type="number" min="0" max="100" value={settings.gradeExamWeight} onChange={(event) => setSettings((current) => ({ ...current, gradeExamWeight: Number(event.target.value) }))} /><b>%</b></div><small>Contribution of the end-of-term examination.</small></label>
          <div className={`settings-weight-total ${gradingReady ? "ready" : "error"}`}><span>Total result weighting</span><strong>{weightTotal}%</strong><small>{gradingReady ? "Ready — the final subject result is normalized to 100%." : "CA + Exam must equal 100%."}</small></div>
        </div>
        <label className="settings-checkbox-row"><input type="checkbox" checked={settings.allowPartialReportCards} onChange={(event) => setSettings((current) => ({ ...current, allowPartialReportCards: event.target.checked }))} /><span><strong>Allow partial report cards</strong><small>Only enable this if the school intentionally allows a report to be issued while some eligible subject results are missing.</small></span></label>
        <div className="settings-action-row three">
          <SettingsLink icon={<GraduationCap size={18} />} title="Academic Setup" detail="Classes, subjects, assigned teachers and assessment structure." href="/school/academics/setup" />
          <SettingsLink icon={<CalendarDays size={18} />} title="Timetable Setup" detail="School periods, breaks and weekly subject lesson requirements." href="/school/timetable/setup" />
          <SettingsLink icon={<FileText size={18} />} title="Report Card Setup" detail="Grading bands, themes, signers, positions and promotion rules." href="/school/settings/reporting/intelligence" />
        </div>
      </section>

      <section id="people-access" className="settings-panel">
        <div className="settings-panel-heading">
          <div className="settings-step-icon"><UsersRound size={20} /></div>
          <div><span>4 · PEOPLE & ACCESS</span><h2>Who can use SukuuNova, and what can they do?</h2><p>Start with normal job roles. Only use individual permission overrides when a person genuinely needs an exception.</p></div>
        </div>
        <div className="settings-action-row three">
          <SettingsLink icon={<UsersRound size={18} />} title="Staff & Teachers" detail="Create staff identities and connect teaching responsibilities." href="/school/staff" />
          <SettingsLink icon={<ShieldCheck size={18} />} title="People & Access" detail="Activate accounts, assign roles and review effective access." href="/school/settings/access" />
          <SettingsLink icon={<ShieldCheck size={18} />} title="Roles & Permissions" detail="Understand and configure what each school role is allowed to do." href="/school/settings/roles" />
        </div>
      </section>

      <section id="communication-documents" className="settings-panel">
        <div className="settings-panel-heading">
          <div className="settings-step-icon"><MessageSquareText size={20} /></div>
          <div><span>5 · COMMUNICATION & DOCUMENTS</span><h2>School messages and official output</h2><p>Set the sender identity here, then use the dedicated workspaces for delivery rules, document templates and exports.</p></div>
        </div>
        <div className="settings-form-grid">
          <label className="settings-field"><span>SMS sender ID</span><input maxLength={20} value={settings.smsSenderId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, smsSenderId: event.target.value }))} placeholder="e.g. EUGENEACADEMY" /><small>The name families see when the configured SMS provider supports sender IDs.</small></label>
          <div className="settings-readonly"><span>Official document identity</span><strong>{school.logoUrl ? "Logo ready" : "Logo still needed"}</strong><small>The school name and logo above are reused by supported official documents.</small></div>
        </div>
        <div className="settings-action-row three">
          <SettingsLink icon={<BellRing size={18} />} title="Communication Settings" detail="SMS, WhatsApp, notices and communication automations." href="/school/communications/settings" />
          <SettingsLink icon={<FileText size={18} />} title="Downloads & Exports" detail="Create school documents and data exports from one place." href="/school/downloads" />
          <SettingsLink icon={<CheckCircle2 size={18} />} title="Account Security" detail="Password and security controls for your own signed-in account." href="/account/security" />
        </div>
      </section>

      <div className="settings-bottom-save">
        <div><strong>Finished changing school-wide settings?</strong><span>Save once. Connected SukuuNova modules will use the updated values.</span></div>
        <button className="settings-save" type="button" onClick={() => void save()} disabled={busy || !gradingReady}>{busy ? "Saving…" : "Save school settings"}</button>
      </div>
    </div>
  );
}

function SettingsLink({ icon, title, detail, href }: { icon: React.ReactNode; title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="settings-link-card">
      <div className="settings-link-icon">{icon}</div>
      <div><strong>{title}</strong><span>{detail}</span></div>
      <ChevronRight size={16} />
    </Link>
  );
}
