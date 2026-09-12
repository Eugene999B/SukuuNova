"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { AdmissionPortraitField } from "./AdmissionPortraitField";

type Option = { id: string; name: string; level?: string | null };
type Year = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean };
type Term = { id: string; name: string; academicYearId: string; academicYearName: string; isLocked: boolean; isCurrent: boolean };
type Prefill = { enquiryId?: string; studentName?: string; guardianName?: string; guardianPhone?: string; guardianEmail?: string; intendedClass?: string };
export type AdmissionFormState = { message: string | null };

type Props = {
  classes: Option[];
  academicYears: Year[];
  terms: Term[];
  prefill: Prefill;
  action: (state: AdmissionFormState, formData: FormData) => Promise<AdmissionFormState>;
};

export function NewAdmissionForm({ classes, academicYears, terms, prefill, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { message: null });
  const defaultYear = academicYears.find((year) => year.isCurrent)?.id ?? academicYears[0]?.id ?? "";
  const [yearId, setYearId] = useState(defaultYear);
  const availableTerms = useMemo(() => terms.filter((term) => term.academicYearId === yearId), [terms, yearId]);
  const defaultTerm = availableTerms.find((term) => term.isCurrent && !term.isLocked)?.id ?? availableTerms.find((term) => !term.isLocked)?.id ?? "";
  const [termId, setTermId] = useState(defaultTerm);

  function changeYear(next: string) {
    setYearId(next);
    const nextTerms = terms.filter((term) => term.academicYearId === next && !term.isLocked);
    setTermId(nextTerms.find((term) => term.isCurrent)?.id ?? nextTerms[0]?.id ?? "");
  }

  return (
    <form className="admission-form" action={formAction}>
      {prefill.enquiryId ? <input type="hidden" name="enquiryId" value={prefill.enquiryId} /> : null}
      <section className="admission-form-section">
        <h3>1. Learner details</h3>
        <p>Capture the identity information that will become part of the official learner record after admission.</p>
        <div className="admission-grid">
          <label className="wide">Full name<input name="studentName" defaultValue={prefill.studentName ?? ""} required maxLength={180} autoComplete="name" /></label>
          <label>Date of birth<input type="date" name="dob" /></label>
          <label>Gender<select name="gender" defaultValue=""><option value="">Not specified</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other / prefer not to say</option></select></label>
          <label className="wide">Previous school<input name="previousSchool" maxLength={240} placeholder="Optional" /></label>
        </div>
      </section>

      <section className="admission-form-section">
        <h3>2. Parent / guardian</h3>
        <p>A guardian name and phone number are required before an application can be submitted.</p>
        <div className="admission-grid">
          <label>Guardian name<input name="guardianName" defaultValue={prefill.guardianName ?? ""} required maxLength={180} /></label>
          <label>Phone<input name="guardianPhone" defaultValue={prefill.guardianPhone ?? ""} required maxLength={40} inputMode="tel" /></label>
          <label>Email<input type="email" name="guardianEmail" defaultValue={prefill.guardianEmail ?? ""} maxLength={240} /></label>
          <label>Relationship<select name="guardianRelationship" defaultValue="Parent/Guardian"><option>Parent/Guardian</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Sibling</option><option>Relative</option></select></label>
          <label className="wide">Residential address<textarea name="residentialAddress" rows={3} maxLength={600} placeholder="Town / area, landmark and any useful address details" /></label>
        </div>
      </section>

      <section className="admission-form-section">
        <h3>3. Academic placement</h3>
        <p>This is the proposed placement used on the admission letter. The learner is not added to the official register yet.</p>
        <div className="admission-grid">
          <label>Entry type<select name="entryType" defaultValue="New enrollment"><option>New enrollment</option><option>Transfer in</option><option>Re-enrollment</option><option>Returning learner</option></select></label>
          <label>Class<select name="intendedClassId" required defaultValue=""><option value="">Choose class…</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select>{prefill.intendedClass ? <small>Enquiry note: {prefill.intendedClass}</small> : null}</label>
          <label>Academic year<select name="academicYearId" required value={yearId} onChange={(event) => changeYear(event.target.value)}><option value="">Choose academic year…</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " · current" : ""}</option>)}</select></label>
          <label>Entry term<select name="termId" required value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">Choose term…</option>{availableTerms.map((term) => <option key={term.id} value={term.id} disabled={term.isLocked}>{term.name}{term.isLocked ? " · locked" : term.isCurrent ? " · current" : ""}</option>)}</select></label>
          <label>Proposed admission / reporting date<input type="date" name="admissionDate" required /></label>
        </div>
      </section>

      <section className="admission-form-section">
        <h3>4. Admission portrait</h3>
        <p>Use automatic capture where available. If biometric verification is not configured, a valid registration portrait can still be saved and verified later.</p>
        <AdmissionPortraitField />
      </section>

      <section className="admission-form-section">
        <h3>5. Application note</h3>
        <p>Keep an internal note for the admissions team. It is not printed automatically on the admission letter.</p>
        <div className="admission-grid"><label className="wide">Internal note<textarea name="decisionNote" rows={4} maxLength={1200} /></label></div>
      </section>

      {state.message ? <div className="app-alert error" role="alert">{state.message}</div> : null}
      <div className="admission-form-actions">
        <Link className="button secondary" href="/school/admissions/applications">Cancel</Link>
        <button className="button secondary" type="submit" name="intent" value="draft" disabled={pending}>Save draft</button>
        <button className="button primary" type="submit" name="intent" value="submit" disabled={pending}>{pending ? "Saving…" : "Submit application"}</button>
      </div>
    </form>
  );
}
