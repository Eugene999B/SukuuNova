"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, CircleCheckBig, LoaderCircle, LockKeyhole, Plus, ShieldCheck } from "lucide-react";

type LeadershipAccount = { id: string; name: string; email: string | null; role: string; temporaryPassword: string };
type CreatedSchool = { id: string; leadership: LeadershipAccount[]; name: string; uniqueCode: string; ownerEmail: string; ownerPassword: string; billing: string };

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  step?: string;
  pattern?: string;
  title?: string;
  disabled?: boolean;
  wide?: boolean;
};

function Field({ label, wide, ...input }: FieldProps) {
  return <label className={`platform-onboarding-form-v3-field ${wide ? "is-wide" : ""}`}><span>{label}</span><input {...input}/></label>;
}

export function SchoolOnboardingForm() {
  const [notice, setNotice] = useState("Complete the four sections below. SukuuNova provisions the tenant only after you submit the final step.");
  const [created, setCreated] = useState<CreatedSchool | null>(null);
  const [busy, setBusy] = useState(false);
  const [principalEnabled, setPrincipalEnabled] = useState(false);
  const [administratorEnabled, setAdministratorEnabled] = useState(false);
  const [billingMode, setBillingMode] = useState("flat");
  const selectedDescription = useMemo(() => billingMode === "per_student" ? "Monthly platform billing scales with the school’s active learner count." : "One predictable monthly platform charge regardless of learner count.", [billingMode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form).entries());
    if (busy) return;
    const leadership = [
      ...(principalEnabled ? [{ role: "Principal", name: input.principalName, email: input.principalEmail }] : []),
      ...(administratorEnabled ? [{ role: "Administrator", name: input.administratorName, email: input.administratorEmail }] : []),
    ];
    setCreated(null);
    setBusy(true);
    setNotice("Creating tenant isolation, access, commercial rules and baseline controls…");
    try {
      const response = await fetch("/api/platform/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, billingMode, leadership }),
      });
      const result = await response.json() as { message?: string; result?: { school?: { id?: string; name?: string; uniqueCode?: string }; leadership?: LeadershipAccount[]; billing?: { billingMode?: string; studentRate?: number; flatRate?: number } } };
      if (!response.ok) {
        setNotice(result.message ?? "School onboarding failed. Review the form and try again.");
        return;
      }
      const school = result.result?.school;
      setCreated({
        id: school?.id ?? "",
        leadership: result.result?.leadership ?? [],
        name: school?.name ?? String(input.schoolName),
        uniqueCode: school?.uniqueCode ?? String(input.uniqueCode),
        ownerEmail: String(input.ownerEmail),
        ownerPassword: String(input.ownerPassword),
        billing: billingMode === "per_student" ? `${input.currency || "GHS"} ${input.studentRate || 0} per active learner` : `${input.currency || "GHS"} ${input.flatRate || 0} flat monthly rate`,
      });
      setNotice("School created. The tenant is ready for its first operational setup pass.");
      form.reset();
      setBillingMode("flat");
      setPrincipalEnabled(false);
      setAdministratorEnabled(false);
    } catch {
      setNotice("School onboarding failed before completion. No partial handoff should be assumed; please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="platform-onboarding-form-v3">
    {created ? <section className="platform-onboarding-success-v3" role="status" aria-live="polite">
      <div className="platform-onboarding-success-v3-head"><span><CircleCheckBig size={17}/></span><div><span className="platform-eyebrow">School ready</span><h3>{created.name}</h3><p>The tenant was provisioned. Capture the one-time login handoff now, then move directly into School 360.</p></div></div>
      <div className="platform-onboarding-success-v3-credentials">
        <div><span>School login code</span><strong>{created.uniqueCode}</strong></div>
        <div><span>Owner email</span><strong>{created.ownerEmail}</strong></div>
        <div><span>Initial owner password</span><code>{created.ownerPassword}</code></div>
        <div><span>Billing rule</span><strong>{created.billing}</strong></div>
      </div>
      {created.leadership.length ? <div className="platform-onboarding-success-v3-leadership">{created.leadership.map((person) => <div key={person.id}><b>{person.role} · {person.name}</b><span>{person.email ?? "No email"}</span><span>Temporary password: {person.temporaryPassword}</span></div>)}</div> : null}
      <ol className="platform-onboarding-success-v3-checklist"><li>Send each person only their own login credentials.</li><li>Require the owner and leadership to replace temporary passwords on first login.</li><li>Open School 360 to confirm profile, access and commercial state.</li><li>Continue academic setup: year, term, classes, subjects, staff, learners and guardians.</li></ol>
      <div className="platform-onboarding-success-v3-actions">{created.id ? <a className="is-primary" href={`/platform/schools/${created.id}`}>Open School 360 <ArrowRight size={13}/></a> : null}<button type="button" onClick={() => setCreated(null)}>Hide credentials</button><a href="/platform/schools">School network</a><a href="/login/school">School login</a></div>
    </section> : <div className="platform-onboarding-form-v3-status" role="status"><span>{busy ? <LoaderCircle size={15}/> : <ShieldCheck size={15}/>}</span><div><b>{busy ? "Provisioning in progress" : "Atomic provisioning"}</b><div>{notice}</div></div></div>}

    <form onSubmit={submit} className="platform-onboarding-form-v3">
      <section className="platform-onboarding-form-v3-section">
        <div className="platform-onboarding-form-v3-section-head"><span className="platform-onboarding-form-v3-step">01</span><div><h3>School identity</h3><p>Create the tenant identity people will recognise and use to sign in.</p></div></div>
        <div className="platform-onboarding-form-v3-grid">
          <Field label="School name" name="schoolName" placeholder="e.g. Adom Senior High School" required />
          <Field label="School login code" name="uniqueCode" placeholder="e.g. adom-shs" pattern="[a-z0-9-]{3,40}" title="3–40 lowercase letters, numbers, or hyphens" required />
          <label className="platform-onboarding-form-v3-field"><span>School type</span><select name="schoolType" defaultValue="basic_school"><option value="basic_school">Basic school</option><option value="senior_high">Senior high school</option><option value="private_school">Private school</option><option value="international">International school</option><option value="other">Other</option></select></label>
          <Field label="Country" name="country" defaultValue="Ghana" />
          <Field label="Region / state" name="region" placeholder="e.g. Ashanti Region" />
          <Field label="City / district" name="city" placeholder="e.g. Kumasi" />
          <Field label="School address" name="address" placeholder="Street, town or postal address" wide />
          <Field label="School phone" name="schoolPhone" placeholder="+233 …" />
          <Field label="School email" name="schoolEmail" type="email" placeholder="office@school.example" />
        </div>
      </section>

      <section className="platform-onboarding-form-v3-section">
        <div className="platform-onboarding-form-v3-section-head"><span className="platform-onboarding-form-v3-step">02</span><div><h3>Owner & accountable access</h3><p>Create the first school operator. The owner receives the system Owner role and must replace the temporary password after first login.</p></div></div>
        <div className="platform-onboarding-form-v3-grid">
          <Field label="Owner full name" name="ownerName" placeholder="Full name" required />
          <Field label="Owner email" name="ownerEmail" type="email" placeholder="owner@school.example" required />
          <Field label="Initial owner password" name="ownerPassword" type="password" minLength={12} maxLength={256} placeholder="12+ characters" required />
          <Field label="Owner phone" name="ownerPhone" placeholder="Optional" />
        </div>
        <div className="platform-onboarding-form-v3-leadership">
          <label className="platform-onboarding-form-v3-toggle"><input type="checkbox" checked={principalEnabled} onChange={(event) => setPrincipalEnabled(event.target.checked)}/><span><b>Add Principal / Headmaster</b><small>SukuuNova generates a separate temporary password and forces first-login replacement.</small></span></label>
          {principalEnabled ? <div className="platform-onboarding-form-v3-extra"><div className="platform-onboarding-form-v3-grid"><Field label="Principal name" name="principalName" minLength={2} maxLength={160} required/><Field label="Principal email" name="principalEmail" type="email" required/></div></div> : null}
          <label className="platform-onboarding-form-v3-toggle"><input type="checkbox" checked={administratorEnabled} onChange={(event) => setAdministratorEnabled(event.target.checked)}/><span><b>Add School Administrator</b><small>Create a separate accountable administrator instead of sharing the owner login.</small></span></label>
          {administratorEnabled ? <div className="platform-onboarding-form-v3-extra"><div className="platform-onboarding-form-v3-grid"><Field label="Administrator name" name="administratorName" minLength={2} maxLength={160} required/><Field label="Administrator email" name="administratorEmail" type="email" required/></div></div> : null}
        </div>
      </section>

      <section className="platform-onboarding-form-v3-section">
        <div className="platform-onboarding-form-v3-section-head"><span className="platform-onboarding-form-v3-step">03</span><div><h3>Commercial setup</h3><p>Choose how SukuuNova bills this school. Messaging credits remain a separate wallet.</p></div></div>
        <div className="platform-onboarding-form-v3-billing">
          <button type="button" className={billingMode === "flat" ? "is-active" : ""} onClick={() => setBillingMode("flat")}><b>Flat monthly rate</b><span>{billingMode === "flat" ? selectedDescription : "One recurring platform charge for the school."}</span></button>
          <button type="button" className={billingMode === "per_student" ? "is-active" : ""} onClick={() => setBillingMode("per_student")}><b>Per active learner</b><span>{billingMode === "per_student" ? selectedDescription : "Scale the platform fee with active enrolment."}</span></button>
        </div>
        <div className="platform-onboarding-form-v3-grid">
          <Field label="Currency" name="currency" defaultValue="GHS" />
          <Field label="Student rate" name="studentRate" type="number" min="0" step="0.01" defaultValue="0" disabled={billingMode !== "per_student"}/>
          <Field label="Flat monthly rate" name="flatRate" type="number" min="0" step="0.01" defaultValue="0" disabled={billingMode !== "flat"}/>
          <Field label="Billing day" name="billingDay" type="number" min="1" max="28" defaultValue="1" />
          <Field label="Grace period · days" name="graceDays" type="number" min="0" max="90" defaultValue="7" />
          <Field label="Trial period · days" name="trialDays" type="number" min="0" max="365" defaultValue="0" />
        </div>
      </section>

      <section className="platform-onboarding-form-v3-section">
        <div className="platform-onboarding-form-v3-section-head"><span className="platform-onboarding-form-v3-step">04</span><div><h3>Operational baseline</h3><p>Set the school clock explicitly. SukuuNova then creates settings, roles, permissions, audit history and the messaging wallet with the tenant.</p></div></div>
        <div className="platform-onboarding-form-v3-grid"><Field label="Timezone" name="timezone" defaultValue="Africa/Accra"/><div className="platform-onboarding-form-v3-status"><span><LockKeyhole size={14}/></span><div><b>Isolation enforced</b><div>Tenant records are created inside the school’s RLS context.</div></div></div></div>
      </section>

      <button disabled={busy} className="platform-onboarding-form-v3-submit">{busy ? <><LoaderCircle size={15}/>Provisioning school…</> : <><Plus size={15}/>Create & provision school</>}</button>
    </form>
  </div>;
}
