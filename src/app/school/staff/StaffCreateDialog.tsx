"use client";

import { useMemo, useState, useTransition } from "react";
import { createStaff } from "./actions";
import { STAFF_CATEGORIES } from "./staff-taxonomy";

type Item = { id: string; name: string; level?: string | null };

export function StaffCreateDialog({ classes, subjects }: { classes: Item[]; subjects: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [categoryId, setCategoryId] = useState("teaching");
  const [role, setRole] = useState("Teacher");
  const [customRole, setCustomRole] = useState("");

  const category = useMemo(() => STAFF_CATEGORIES.find((item) => item.id === categoryId) ?? STAFF_CATEGORIES[0], [categoryId]);
  const selectedRole = category.roles.find((item) => item.name === role) ?? category.roles[0];
  const isCustom = categoryId === "custom";
  const isTeaching = categoryId === "teaching";

  function reset() {
    setStep(1);
    setResult(null);
    setCategoryId("teaching");
    setRole("Teacher");
    setCustomRole("");
  }

  function changeCategory(next: string) {
    const nextCategory = STAFF_CATEGORIES.find((item) => item.id === next) ?? STAFF_CATEGORIES[0];
    setCategoryId(next);
    setRole(nextCategory.roles[0]?.name ?? "Custom Role");
    setCustomRole("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const form = new FormData(event.currentTarget);
    form.set("staffType", isTeaching ? "teaching" : "non-teaching");
    form.set("staffCategory", category.label);
    if (isCustom) form.set("role", customRole.trim());

    startTransition(async () => {
      const response = await createStaff(form);
      if (response.ok) {
        setResult({ ok: true, message: `Created ${response.name}. Login: ${response.username}. Temporary password: ${response.temporaryPassword}.` });
      } else {
        setResult({ ok: false, message: response.message });
      }
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={() => { reset(); setOpen(true); }}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="staff-modal staff-modal-wide" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <div className="staff-modal-head">
          <div>
            <span>STAFF · NEW ACCOUNT</span>
            <h2 id="staff-dialog-title">Add a staff member</h2>
            <p>Create the school account first. You can refine permissions and access after the account exists.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>

        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <button type="button" onClick={() => window.location.reload()}>Refresh staff list</button> : null}</div> : null}

        {!result ? <>
          <div className="staff-stepper" aria-label="Staff creation steps">
            <div className={step === 1 ? "is-active" : "is-done"}><strong>1</strong><span>Basic details</span></div>
            <i />
            <div className={step === 2 ? "is-active" : ""}><strong>2</strong><span>Role & assignment</span></div>
          </div>

          <form onSubmit={submit}>
            {step === 1 ? <div className="staff-form-grid">
              <label>Full name<input name="name" required placeholder="e.g. Ama Mensah" autoComplete="name" /></label>
              <label>Email address<input name="email" type="email" placeholder="name@school.com" autoComplete="email" /></label>
              <label>Phone number<input name="phone" autoComplete="tel" placeholder="024 xxx xxxx" /></label>
              <label>Workforce area<select name="staffCategorySelect" value={categoryId} onChange={(e) => changeCategory(e.target.value)}>{STAFF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <div className="staff-form-note"><strong>Next</strong><span>We’ll use the next step to assign the person’s school role and, where relevant, their teaching class or subject.</span></div>
            </div> : <div className="staff-form-grid">
              <label>{isCustom ? "Role name" : "Role"}{isCustom ? <input name="customRole" required value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="e.g. School Photographer" autoFocus /> : <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{category.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}</label>
              {isTeaching ? <>
                <label>Primary class<select name="primaryClassId" defaultValue=""><option value="">No class lead yet</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.level ? `${x.level} · ` : ""}{x.name}</option>)}</select></label>
                <label>Primary subject<select name="subjectId" defaultValue=""><option value="">No subject assignment yet</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              </> : null}
              <div className="staff-role-summary"><span>Selected role</span><strong>{isCustom ? (customRole || "Custom role") : selectedRole?.name}</strong><small>{isCustom ? "Permissions can be refined after creation." : selectedRole?.description}</small></div>
              {!isTeaching ? <div className="staff-role-summary"><span>Workforce area</span><strong>{category.label}</strong><small>{category.description}</small></div> : null}
              <div className="staff-form-note wide"><strong>Login setup</strong><span>The account is created with the school login convention and a temporary password. The staff member should change the password immediately after first sign-in.</span></div>
            </div>}

            <div className="staff-modal-actions">
              <button className="staff-secondary-button" type="button" onClick={() => step === 1 ? setOpen(false) : setStep(1)}>{step === 1 ? "Cancel" : "Back"}</button>
              {step === 1 ? <button className="staff-primary-button" type="button" onClick={() => setStep(2)}>Continue →</button> : <button className="staff-primary-button" disabled={pending || (isCustom && !customRole.trim())} type="submit">{pending ? "Creating account…" : "Create staff account"}</button>}
            </div>
          </form>
        </> : null}
      </section>
    </div> : null}
  </>;
}
