"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createStaff } from "./actions";
import { STAFF_CATEGORIES } from "./staff-taxonomy";

type Item = { id: string; name: string; level?: string | null };

export function StaffCreateDialog({ classes, subjects }: { classes: Item[]; subjects: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("teaching");
  const [role, setRole] = useState("Teacher");
  const [customRole, setCustomRole] = useState("");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const detect = () => setDarkMode(root.getAttribute("data-theme") === "dark" || root.classList.contains("dark") || document.body.classList.contains("dark"));
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const category = useMemo(() => STAFF_CATEGORIES.find((item) => item.id === categoryId) ?? STAFF_CATEGORIES[0], [categoryId]);
  const selectedRole = category.roles.find((item) => item.name === role) ?? category.roles[0];
  const isCustom = categoryId === "custom";
  const isTeaching = categoryId === "teaching";

  const fieldStyle: React.CSSProperties = darkMode
    ? { backgroundColor: "#0a1113", color: "#f8fafc", WebkitTextFillColor: "#f8fafc", caretColor: "#f8fafc", colorScheme: "dark", opacity: 1 }
    : { backgroundColor: "#ffffff", color: "#111827", WebkitTextFillColor: "#111827", caretColor: "#111827", colorScheme: "light", opacity: 1 };

  function reset() {
    setStep(1);
    setResult(null);
    setName("");
    setEmail("");
    setPhone("");
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

  function goToRoleStep() {
    if (!name.trim()) return setResult({ ok: false, message: "Enter the staff member's full name before continuing." });
    if (!category.label.trim()) return setResult({ ok: false, message: "Select a workforce area before continuing." });
    setResult(null);
    setStep(2);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      goToRoleStep();
      return;
    }
    setResult(null);
    if (!name.trim()) return setResult({ ok: false, message: "Enter the staff member's full name." });
    if (!category.label.trim()) return setResult({ ok: false, message: "Select a workforce area." });
    const finalRole = isCustom ? customRole.trim() : role.trim();
    if (!finalRole) return setResult({ ok: false, message: "Select a staff role." });

    const form = new FormData();
    form.set("name", name.trim());
    if (email.trim()) form.set("email", email.trim());
    if (phone.trim()) form.set("phone", phone.trim());
    form.set("staffType", isTeaching ? "teaching" : "non-teaching");
    form.set("staffCategory", category.label);
    form.set("role", finalRole);

    const nativeForm = event.currentTarget;
    const primaryClass = nativeForm.elements.namedItem("primaryClassId") as HTMLSelectElement | null;
    const subject = nativeForm.elements.namedItem("subjectId") as HTMLSelectElement | null;
    if (primaryClass?.value) form.set("primaryClassId", primaryClass.value);
    if (subject?.value) form.set("subjectId", subject.value);

    startTransition(async () => {
      const response = await createStaff(form);
      if (response.ok) setResult({ ok: true, message: response.message });
      else setResult({ ok: false, message: response.message });
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={() => { reset(); setOpen(true); }}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="staff-modal staff-modal-wide staff-dialog-region" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <style>{`.staff-dialog-region input.staff-dialog-field,.staff-dialog-region select.staff-dialog-field{background-color:${darkMode ? "#0a1113" : "#fff"}!important;color:${darkMode ? "#f8fafc" : "#111827"}!important;-webkit-text-fill-color:${darkMode ? "#f8fafc" : "#111827"}!important;caret-color:${darkMode ? "#f8fafc" : "#111827"}!important;color-scheme:${darkMode ? "dark" : "light"}!important;opacity:1!important;mix-blend-mode:normal!important}.staff-dialog-region input.staff-dialog-field::placeholder{color:${darkMode ? "#8f9b98" : "#6b7280"}!important;opacity:1!important}.staff-dialog-region input.staff-dialog-field:-webkit-autofill,.staff-dialog-region input.staff-dialog-field:-webkit-autofill:hover,.staff-dialog-region input.staff-dialog-field:-webkit-autofill:focus{-webkit-text-fill-color:${darkMode ? "#f8fafc" : "#111827"}!important;-webkit-box-shadow:0 0 0 1000px ${darkMode ? "#0a1113" : "#fff"} inset!important;box-shadow:0 0 0 1000px ${darkMode ? "#0a1113" : "#fff"} inset!important}.staff-dialog-region select.staff-dialog-field option{background:${darkMode ? "#0a1113" : "#fff"}!important;color:${darkMode ? "#f8fafc" : "#111827"}!important}`}</style>
        <div className="staff-modal-head"><div><span>STAFF · PERSON PROFILE</span><h2 id="staff-dialog-title">Add a staff member</h2><p>Create the person's school profile first. A login is a separate action in Sub-accounts & Access.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <button type="button" onClick={() => window.location.reload()}>Refresh staff list</button> : null}</div> : null}
        {!result || !result.ok ? <><div className="staff-stepper" aria-label="Staff creation steps"><div className={step === 1 ? "is-active" : "is-done"}><strong>1</strong><span>Basic details</span></div><i /><div className={step === 2 ? "is-active" : ""}><strong>2</strong><span>Role & assignment</span></div></div>
          <form onSubmit={submit}>
            {step === 1 ? <div className="staff-form-grid">
              <label>Full name<input className="staff-dialog-field" style={fieldStyle} name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ama Mensah" autoComplete="name" /></label>
              <label>Email address<input className="staff-dialog-field" style={fieldStyle} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.com" autoComplete="email" /></label>
              <label>Phone number<input className="staff-dialog-field" style={fieldStyle} name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="024 xxx xxxx" /></label>
              <label>Workforce area<select className="staff-dialog-field" style={fieldStyle} name="staffCategorySelect" value={categoryId} onChange={(e) => changeCategory(e.target.value)}>{STAFF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              {result && !result.ok ? <div className="staff-form-note wide" role="alert"><strong>Check the form</strong><span>{result.message}</span></div> : null}
              <div className="staff-form-note wide"><strong>Login is separate</strong><span>These details create the staff profile only. The person cannot sign in until an authorised administrator activates a login from Sub-accounts & Access.</span></div>
            </div> : <div className="staff-form-grid">
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="staffCategory" value={category.label} />
              <label>{isCustom ? "Role name" : "Role"}{isCustom ? <input className="staff-dialog-field" style={fieldStyle} name="customRole" required value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="e.g. School Photographer" autoFocus /> : <select className="staff-dialog-field" style={fieldStyle} name="role" value={role} onChange={(e) => setRole(e.target.value)}>{category.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}</label>
              {isTeaching ? <><label>Primary class<select className="staff-dialog-field" style={fieldStyle} name="primaryClassId" defaultValue=""><option value="">No class lead yet</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.level ? `${x.level} · ` : ""}{x.name}</option>)}</select></label><label>Primary subject<select className="staff-dialog-field" style={fieldStyle} name="subjectId" defaultValue=""><option value="">No subject assignment yet</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label></> : null}
              <div className="staff-role-summary"><span>Selected role</span><strong>{isCustom ? (customRole || "Custom role") : selectedRole?.name}</strong><small>{isCustom ? "Permissions can be refined after a login is activated." : selectedRole?.description}</small></div>
              {!isTeaching ? <div className="staff-role-summary"><span>Workforce area</span><strong>{category.label}</strong><small>{category.description}</small></div> : null}
              <div className="staff-form-note wide"><strong>Next step</strong><span>No login or password is created here. After saving the staff profile, an authorised school administrator can select this person in Sub-accounts & Access and activate their login.</span></div>
              {result && !result.ok ? <div className="staff-form-note wide" role="alert"><strong>Check the form</strong><span>{result.message}</span></div> : null}
            </div>}
            <div className="staff-modal-actions"><button className="staff-secondary-button" type="button" onClick={() => step === 1 ? setOpen(false) : setStep(1)}>{step === 1 ? "Cancel" : "Back"}</button>{step === 1 ? <button className="staff-primary-button" type="button" onClick={goToRoleStep}>Continue →</button> : <button className="staff-primary-button" disabled={pending || (isCustom && !customRole.trim())} type="submit">{pending ? "Adding staff…" : "Add staff profile"}</button>}</div>
          </form>
        </> : null}
      </section>
    </div> : null}
  </>;
}
