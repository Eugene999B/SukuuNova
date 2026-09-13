"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { updateStaffProfile } from "@/app/school/staff/profile-actions";

export type StaffPersonnelInitial = {
  staffNumber: string;
  gender: string;
  dob: string;
  nationality: string;
  dateJoined: string;
  staffType: string;
  staffCategory: string;
  jobTitle: string;
  department: string;
  employmentStatus: string;
  employmentType: string;
  highestQualification: string;
  professionalQualification: string;
  residentialAddress: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  notes: string;
};

export function StaffPersonnelForm({ staffId, staffName, initial, canEdit }: { staffId: string; staffName: string; initial: StaffPersonnelInitial; canEdit: boolean }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initial), [values, initial]);

  function set(key: keyof StaffPersonnelInitial, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateStaffProfile(formData);
      setMessage({ ok: result.ok, text: result.message });
    });
  }

  const disabled = !canEdit || pending;

  return <form onSubmit={submit} className="product-workspace">
    <input type="hidden" name="staffId" value={staffId}/>
    <input type="hidden" name="staffType" value={values.staffType}/>
    <input type="hidden" name="staffCategory" value={values.staffCategory}/>
    {message ? <div className={message.ok ? "product-state" : "product-state product-state-error"} role="status"><h3>{message.ok ? "Saved" : "Could not save"}</h3><p>{message.text}</p></div> : null}
    {dirty && !pending ? <p role="status" style={{ fontSize: 13, color: "var(--color-warning)" }}>Unsaved personnel changes.</p> : null}

    <section className="product-section">
      <header className="product-section-head"><div><span className="product-eyebrow">Identity & demographics</span><h2>Personnel identity</h2><p>These details support school records and workforce statistics. Login credentials remain separate.</p></div></header>
      <div className="product-form-section">
        <label className="product-field"><span>Staff number</span><input name="staffNumber" value={values.staffNumber} onChange={(e) => set("staffNumber", e.target.value)} disabled={disabled} maxLength={48}/><small>Unique within this school.</small></label>
        <label className="product-field"><span>Gender</span><select name="gender" value={values.gender} onChange={(e) => set("gender", e.target.value)} disabled={disabled}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
        <label className="product-field"><span>Date of birth</span><input type="date" name="dob" value={values.dob} onChange={(e) => set("dob", e.target.value)} disabled={disabled}/></label>
        <label className="product-field"><span>Nationality</span><input name="nationality" value={values.nationality} onChange={(e) => set("nationality", e.target.value)} disabled={disabled} maxLength={120}/></label>
        <label className="product-field"><span>Residential address</span><textarea name="residentialAddress" value={values.residentialAddress} onChange={(e) => set("residentialAddress", e.target.value)} disabled={disabled} rows={3} maxLength={600}/></label>
      </div>
    </section>

    <section className="product-section">
      <header className="product-section-head"><div><span className="product-eyebrow">Employment</span><h2>Workforce record</h2><p>Employment data is independent of account roles so HR reporting does not change when permissions change.</p></div></header>
      <div className="product-form-section">
        <label className="product-field"><span>Date joined</span><input type="date" name="dateJoined" value={values.dateJoined} onChange={(e) => set("dateJoined", e.target.value)} disabled={disabled}/></label>
        <label className="product-field"><span>Job title</span><input name="jobTitle" value={values.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} disabled={disabled} maxLength={160}/></label>
        <label className="product-field"><span>Department / unit</span><input name="department" value={values.department} onChange={(e) => set("department", e.target.value)} disabled={disabled} maxLength={160}/></label>
        <label className="product-field"><span>Employment status</span><select name="employmentStatus" value={values.employmentStatus} onChange={(e) => set("employmentStatus", e.target.value)} disabled={disabled}><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select></label>
        <label className="product-field"><span>Employment type</span><select name="employmentType" value={values.employmentType} onChange={(e) => set("employmentType", e.target.value)} disabled={disabled}><option value="">Not recorded</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="intern">Intern</option><option value="nss">National Service</option><option value="other">Other</option></select></label>
        <label className="product-field"><span>Workforce category</span><input value={values.staffCategory || "Not recorded"} readOnly aria-readonly="true"/><small>Set from staff registration and role setup.</small></label>
      </div>
    </section>

    <section className="product-section">
      <header className="product-section-head"><div><span className="product-eyebrow">Qualifications</span><h2>Professional background</h2><p>Keep qualifications concise enough for staffing and compliance reports.</p></div></header>
      <div className="product-form-section">
        <label className="product-field"><span>Highest qualification</span><input name="highestQualification" value={values.highestQualification} onChange={(e) => set("highestQualification", e.target.value)} disabled={disabled} maxLength={240}/></label>
        <label className="product-field"><span>Professional qualification</span><input name="professionalQualification" value={values.professionalQualification} onChange={(e) => set("professionalQualification", e.target.value)} disabled={disabled} maxLength={240}/></label>
      </div>
    </section>

    <section className="product-section">
      <header className="product-section-head"><div><span className="product-eyebrow">Emergency</span><h2>Emergency contact</h2><p>Restricted personnel information for authorised school administrators.</p></div></header>
      <div className="product-form-section">
        <label className="product-field"><span>Contact name</span><input name="emergencyContactName" value={values.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} disabled={disabled} maxLength={180}/></label>
        <label className="product-field"><span>Phone</span><input name="emergencyContactPhone" value={values.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} disabled={disabled} maxLength={40} inputMode="tel"/></label>
        <label className="product-field"><span>Relationship</span><input name="emergencyContactRelationship" value={values.emergencyContactRelationship} onChange={(e) => set("emergencyContactRelationship", e.target.value)} disabled={disabled} maxLength={100}/></label>
        <label className="product-field"><span>Internal personnel note</span><textarea name="notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} disabled={disabled} rows={3} maxLength={1200}/></label>
      </div>
    </section>

    <div className="product-sticky-actions">
      <Link className="button secondary" href={`/school/staff/${encodeURIComponent(staffId)}`}>Back to {staffName}</Link>
      {canEdit ? <button className="button primary" type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : dirty ? "Save personnel profile" : "Saved"}</button> : <span className="module-muted">Read-only access</span>}
    </div>
  </form>;
}
