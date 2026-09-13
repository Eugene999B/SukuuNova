"use client";

import { useMemo, useState, useTransition } from "react";
import { createStaffWithProfile } from "./profile-actions";
import { STAFF_CATEGORIES } from "./staff-taxonomy";

type SubjectItem = { id: string; name: string };
type ClassItem = { id: string; name: string; level?: string | null; subjects: SubjectItem[] };
type AssignmentDraft = { key: number; classId: string; subjectIds: string[] };

export function StaffCreateDialogV2({ classes, subjects }: { classes: ClassItem[]; subjects: SubjectItem[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [categoryId, setCategoryId] = useState("teaching");
  const [role, setRole] = useState("Teacher");
  const [customRole, setCustomRole] = useState("");
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([{ key: 1, classId: "", subjectIds: [] }]);

  const category = useMemo(() => STAFF_CATEGORIES.find((item) => item.id === categoryId) ?? STAFF_CATEGORIES[0], [categoryId]);
  const selectedRole = category.roles.find((item) => item.name === role) ?? category.roles[0];
  const isCustom = categoryId === "custom";
  const isTeaching = categoryId === "teaching";

  function reset() {
    setResult(null);
    setName("");
    setEmail("");
    setPhone("");
    setGender("");
    setCategoryId("teaching");
    setRole("Teacher");
    setCustomRole("");
    setAssignments([{ key: 1, classId: "", subjectIds: [] }]);
  }

  function openDialog() { reset(); setOpen(true); }

  function changeCategory(next: string) {
    const nextCategory = STAFF_CATEGORIES.find((item) => item.id === next) ?? STAFF_CATEGORIES[0];
    setCategoryId(next);
    setRole(nextCategory.roles[0]?.name ?? "Custom Role");
    setCustomRole("");
    setResult(null);
  }

  function setAssignmentClass(key: number, classId: string) {
    setAssignments((current) => current.map((row) => row.key === key ? { ...row, classId, subjectIds: [] } : row));
  }

  function toggleAssignmentSubject(key: number, subjectId: string) {
    setAssignments((current) => current.map((row) => {
      if (row.key !== key) return row;
      return { ...row, subjectIds: row.subjectIds.includes(subjectId) ? row.subjectIds.filter((id) => id !== subjectId) : [...row.subjectIds, subjectId] };
    }));
  }

  function addAssignment() {
    setAssignments((current) => [...current, { key: Math.max(0, ...current.map((row) => row.key)) + 1, classId: "", subjectIds: [] }]);
  }

  function removeAssignment(key: number) {
    setAssignments((current) => current.length === 1 ? [{ key: 1, classId: "", subjectIds: [] }] : current.filter((row) => row.key !== key));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const finalRole = isCustom ? customRole.trim() : role.trim();
    if (!name.trim()) return setResult({ ok: false, message: "Enter the staff member's full name." });
    if (!gender) return setResult({ ok: false, message: "Choose the staff member's gender." });
    if (!phone.trim()) return setResult({ ok: false, message: "Enter a phone number. It is also the first-login password." });
    if (!finalRole) return setResult({ ok: false, message: "Select a staff role." });

    const selectedAssignments = assignments.filter((row) => row.classId || row.subjectIds.length);
    for (const row of selectedAssignments) {
      if (!row.classId) return setResult({ ok: false, message: "Choose a class for every teaching assignment." });
      if (!row.subjectIds.length) return setResult({ ok: false, message: "Choose at least one subject for every selected class." });
    }
    const selectedClasses = selectedAssignments.map((row) => row.classId);
    if (new Set(selectedClasses).size !== selectedClasses.length) return setResult({ ok: false, message: "Use each class once and select all subjects for that class together." });

    const form = new FormData(event.currentTarget);
    form.set("name", name.trim());
    form.set("phone", phone.trim());
    form.set("gender", gender);
    if (email.trim()) form.set("email", email.trim());
    form.set("staffType", isTeaching ? "teaching" : "non-teaching");
    form.set("staffCategory", category.label);
    form.set("role", finalRole);
    form.set("teachingAssignments", JSON.stringify(selectedAssignments.map(({ classId, subjectIds }) => ({ classId, subjectIds }))));

    startTransition(async () => {
      const response = await createStaffWithProfile(form);
      setResult({ ok: response.ok, message: response.message });
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={openDialog}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="staff-modal staff-modal-wide staff-dialog-region" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <div className="staff-modal-head">
          <div><span>STAFF · ACCOUNT + PERSONNEL</span><h2 id="staff-dialog-title">Add staff and create the personnel record</h2><p>The login, role, demographic profile and teaching scope are created together. HR details can be refined later from Personnel.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>

        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <div className="staff-dialog-result-actions"><button type="button" onClick={reset}>Add another staff member</button><button type="button" onClick={() => window.location.reload()}>Done</button></div> : null}</div> : null}

        {!result?.ok ? <form onSubmit={submit}>
          <div className="staff-form-grid">
            <label>Full name<input className="staff-dialog-field" name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Mensah" autoComplete="name" /></label>
            <label>Gender <span aria-hidden="true">*</span><select className="staff-dialog-field" name="gender" required value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Choose gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
            <label>Phone number <span aria-hidden="true">*</span><input className="staff-dialog-field" name="phone" required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="0241234567" /></label>
            <label>Email address<input className="staff-dialog-field" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@school.com" autoComplete="email" /></label>
            <label>Workforce area<select className="staff-dialog-field" name="staffCategorySelect" value={categoryId} onChange={(event) => changeCategory(event.target.value)}>{STAFF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>{isCustom ? "Role name" : "Primary role"}{isCustom ? <input className="staff-dialog-field" name="customRole" required value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="e.g. School Photographer" /> : <select className="staff-dialog-field" name="role" value={role} onChange={(event) => setRole(event.target.value)}>{category.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}</label>
          </div>

          <details className="sn-progressive staff-personnel-details">
            <summary>Personnel & employment details</summary>
            <div className="sn-progressive-body staff-form-grid">
              <label>Staff number<input className="staff-dialog-field" name="staffNumber" maxLength={48} placeholder="Auto-generated if blank" /></label>
              <label>Date joined<input className="staff-dialog-field" type="date" name="dateJoined" /></label>
              <label>Date of birth<input className="staff-dialog-field" type="date" name="dob" /></label>
              <label>Nationality<input className="staff-dialog-field" name="nationality" maxLength={120} placeholder="e.g. Ghanaian" /></label>
              <label>Job title<input className="staff-dialog-field" name="jobTitle" maxLength={160} placeholder="Defaults to selected role" /></label>
              <label>Department / unit<input className="staff-dialog-field" name="department" maxLength={160} placeholder="e.g. Mathematics" /></label>
              <label>Employment type<select className="staff-dialog-field" name="employmentType" defaultValue="full_time"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="intern">Intern</option><option value="nss">National Service</option><option value="other">Other</option></select></label>
              <label>Highest qualification<input className="staff-dialog-field" name="highestQualification" maxLength={240} placeholder="e.g. B.Ed. Mathematics" /></label>
              <label className="wide">Professional qualification<input className="staff-dialog-field" name="professionalQualification" maxLength={240} placeholder="Optional teaching/professional credential" /></label>
              <label>Emergency contact name<input className="staff-dialog-field" name="emergencyContactName" maxLength={180} /></label>
              <label>Emergency contact phone<input className="staff-dialog-field" name="emergencyContactPhone" maxLength={40} inputMode="tel" /></label>
              <label>Emergency relationship<input className="staff-dialog-field" name="emergencyContactRelationship" maxLength={100} placeholder="e.g. Spouse, sibling" /></label>
              <label className="wide">Residential address<textarea className="staff-dialog-field" name="residentialAddress" rows={2} maxLength={600} /></label>
            </div>
          </details>

          <div className="staff-form-grid">
            {isTeaching ? <div className="wide staff-teaching-builder">
              <div className="staff-teaching-builder-head"><div><strong>Classes & subjects taught</strong><span>A teacher can handle several subjects in one class and different subjects in other classes.</span></div><button type="button" onClick={addAssignment}>＋ Add another class</button></div>
              <div className="staff-teaching-builder-list">{assignments.map((row, index) => {
                const schoolClass = classes.find((item) => item.id === row.classId);
                const otherClasses = new Set(assignments.filter((item) => item.key !== row.key).map((item) => item.classId).filter(Boolean));
                return <div className="staff-teaching-builder-row" key={row.key}>
                  <div className="staff-teaching-builder-row-head"><strong>Teaching assignment {index + 1}</strong><button type="button" onClick={() => removeAssignment(row.key)}>Remove</button></div>
                  <label>Class<select className="staff-dialog-field" value={row.classId} onChange={(event) => setAssignmentClass(row.key, event.target.value)}><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id} disabled={otherClasses.has(item.id)}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
                  {schoolClass ? <div className="staff-subject-picker"><span>Subjects in {schoolClass.name}</span>{schoolClass.subjects.length ? <div>{schoolClass.subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={row.subjectIds.includes(subject.id)} onChange={() => toggleAssignmentSubject(row.key, subject.id)} /><span>{subject.name}</span></label>)}</div> : <small>No curriculum subjects are configured for this class yet. Add them from Classes → Subjects & Teachers first.</small>}</div> : <div className="staff-subject-picker"><small>Select a class to see its curriculum subjects.</small></div>}
                </div>;
              })}</div>
            </div> : null}

            {isTeaching ? <>
              <label>Class headteacher responsibility<select className="staff-dialog-field" name="classHeadId" defaultValue=""><option value="">No class headteacher responsibility</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Class HOD responsibility<select className="staff-dialog-field" name="hodClassId" defaultValue=""><option value="">No class HOD responsibility</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Subject HOD responsibility<select className="staff-dialog-field" name="hodSubjectId" defaultValue=""><option value="">No subject HOD responsibility</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </> : null}

            <div className="staff-role-summary">
              <span>Selected role</span><strong>{isCustom ? (customRole || "Custom role") : selectedRole?.name}</strong><small>{isCustom ? "Permissions can be refined later in Roles & Permissions." : selectedRole?.description}</small>
            </div>
            <div className="staff-form-note wide"><strong>Login is created now</strong><span>The staff account becomes active immediately. The phone number is the first password and SukuuNova requires a password change after first login.</span></div>
            <div className="staff-form-note wide"><strong>Personnel data is separate from login access</strong><span>Gender, employment, qualifications and emergency contact are retained in the staff personnel profile and can be updated without changing roles or passwords.</span></div>
            {result && !result.ok ? <div className="staff-form-note wide" role="alert"><strong>Check the form</strong><span>{result.message}</span></div> : null}
          </div>
          <div className="staff-modal-actions"><button className="staff-secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="staff-primary-button" disabled={pending || !gender || (isCustom && !customRole.trim())} type="submit">{pending ? "Creating staff & profile…" : "Add staff & activate login"}</button></div>
        </form> : null}
      </section>
    </div> : null}
  </>;
}
