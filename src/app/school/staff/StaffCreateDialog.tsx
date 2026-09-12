"use client";

import { useMemo, useState, useTransition } from "react";
import { createStaff } from "./actions";
import { STAFF_CATEGORIES } from "./staff-taxonomy";

type Item = { id: string; name: string; level?: string | null };

export function StaffCreateDialog({ classes, subjects }: { classes: Item[]; subjects: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("teaching");
  const [role, setRole] = useState("Teacher");
  const [customRole, setCustomRole] = useState("");

  const category = useMemo(() => STAFF_CATEGORIES.find((item) => item.id === categoryId) ?? STAFF_CATEGORIES[0], [categoryId]);
  const selectedRole = category.roles.find((item) => item.name === role) ?? category.roles[0];
  const isCustom = categoryId === "custom";
  const isTeaching = categoryId === "teaching";

  function reset() {
    setResult(null);
    setName("");
    setEmail("");
    setPhone("");
    setCategoryId("teaching");
    setRole("Teacher");
    setCustomRole("");
  }

  function openDialog() {
    reset();
    setOpen(true);
  }

  function changeCategory(next: string) {
    const nextCategory = STAFF_CATEGORIES.find((item) => item.id === next) ?? STAFF_CATEGORIES[0];
    setCategoryId(next);
    setRole(nextCategory.roles[0]?.name ?? "Custom Role");
    setCustomRole("");
    setResult(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const finalRole = isCustom ? customRole.trim() : role.trim();
    if (!name.trim()) return setResult({ ok: false, message: "Enter the staff member's full name." });
    if (!phone.trim()) return setResult({ ok: false, message: "Enter a phone number. It is also the first-login password." });
    if (!finalRole) return setResult({ ok: false, message: "Select a staff role." });

    const form = new FormData(event.currentTarget);
    form.set("name", name.trim());
    form.set("phone", phone.trim());
    if (email.trim()) form.set("email", email.trim());
    form.set("staffType", isTeaching ? "teaching" : "non-teaching");
    form.set("staffCategory", category.label);
    form.set("role", finalRole);

    startTransition(async () => {
      const response = await createStaff(form);
      setResult({ ok: response.ok, message: response.message });
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={openDialog}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="staff-modal staff-modal-wide staff-dialog-region" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <div className="staff-modal-head">
          <div><span>STAFF · ONE-STEP SETUP</span><h2 id="staff-dialog-title">Add staff and make the account ready</h2><p>Create the person, login, role, teaching assignment and leadership responsibility together. There is no separate login-activation step.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>

        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><button type="button" onClick={reset}>Add another staff member</button><button type="button" onClick={() => window.location.reload()}>Done</button></div> : null}</div> : null}

        {!result?.ok ? <form onSubmit={submit}>
          <div className="staff-form-grid">
            <label>Full name<input className="staff-dialog-field" name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Mensah" autoComplete="name" /></label>
            <label>Phone number <span aria-hidden="true">*</span><input className="staff-dialog-field" name="phone" required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="0241234567" /></label>
            <label>Email address<input className="staff-dialog-field" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@school.com" autoComplete="email" /></label>
            <label>Workforce area<select className="staff-dialog-field" name="staffCategorySelect" value={categoryId} onChange={(event) => changeCategory(event.target.value)}>{STAFF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>

            <label>{isCustom ? "Role name" : "Primary role"}{isCustom ? <input className="staff-dialog-field" name="customRole" required value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="e.g. School Photographer" /> : <select className="staff-dialog-field" name="role" value={role} onChange={(event) => setRole(event.target.value)}>{category.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}</label>

            {isTeaching ? <>
              <label>Class taught<select className="staff-dialog-field" name="primaryClassId" defaultValue=""><option value="">No class assignment yet</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Subject taught<select className="staff-dialog-field" name="subjectId" defaultValue=""><option value="">No subject assignment yet</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="wide" style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" name="makeClassHead" style={{ width: 18, height: 18 }} /><span>Make this teacher the headteacher/class teacher of the selected class</span></label>
              <label>Class HOD responsibility<select className="staff-dialog-field" name="hodClassId" defaultValue=""><option value="">No class HOD responsibility</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Subject HOD responsibility<select className="staff-dialog-field" name="hodSubjectId" defaultValue=""><option value="">No subject HOD responsibility</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </> : null}

            <div className="staff-role-summary">
              <span>Selected role</span><strong>{isCustom ? (customRole || "Custom role") : selectedRole?.name}</strong><small>{isCustom ? "Permissions can be refined later in Roles & Permissions." : selectedRole?.description}</small>
            </div>
            <div className="staff-form-note wide"><strong>Login is created now</strong><span>The staff account becomes active immediately. The staff member can sign in with the phone number or email. The phone number is the first password, and SukuuNova will require a password change after first login.</span></div>
            {isTeaching ? <div className="staff-form-note wide"><strong>Configure teaching and leadership once</strong><span>The class/subject teaching assignment, class headteacher and class/subject HOD responsibility are saved with the staff member. They remain scoped to the exact class or subject instead of becoming vague global roles.</span></div> : null}
            {result && !result.ok ? <div className="staff-form-note wide" role="alert"><strong>Check the form</strong><span>{result.message}</span></div> : null}
          </div>
          <div className="staff-modal-actions"><button className="staff-secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="staff-primary-button" disabled={pending || (isCustom && !customRole.trim())} type="submit">{pending ? "Creating staff & login…" : "Add staff & activate login"}</button></div>
        </form> : null}
      </section>
    </div> : null}
  </>;
}
