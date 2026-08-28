"use client";

import { useMemo, useState, useTransition } from "react";
import { createStaff } from "./actions";
import { STAFF_CATEGORIES } from "./staff-taxonomy";

type Item = { id: string; name: string; level?: string | null };

export function StaffCreateDialog({ classes, subjects }: { classes: Item[]; subjects: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [categoryId, setCategoryId] = useState("teaching");
  const [role, setRole] = useState("Teacher");
  const [customRole, setCustomRole] = useState("");

  const category = useMemo(() => STAFF_CATEGORIES.find((item) => item.id === categoryId) ?? STAFF_CATEGORIES[1], [categoryId]);
  const selectedRole = category.roles.find((item) => item.name === role) ?? category.roles[0];
  const isCustom = categoryId === "custom";
  const isTeaching = categoryId === "teaching";

  function changeCategory(next: string) {
    const nextCategory = STAFF_CATEGORIES.find((item) => item.id === next) ?? STAFF_CATEGORIES[1];
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
      if (response.ok) setResult({ ok: true, message: `Created ${response.name}. Login: ${response.username}. Temporary password: ${response.temporaryPassword}.` });
      else setResult({ ok: false, message: response.message });
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={() => { setOpen(true); setResult(null); }}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="staff-modal staff-modal-wide" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <div className="staff-modal-head"><div><span>STAFF SETUP · WORKFORCE TAXONOMY</span><h2 id="staff-dialog-title">Create a school account</h2><p>Choose the person's workforce area and exact responsibility. Their role should match the work they actually perform; permissions can be refined later.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <button type="button" onClick={() => window.location.reload()}>Refresh directory</button> : null}</div> : null}
        <form onSubmit={submit}>
          <div className="staff-form-grid">
            <label>Full name<input name="name" required placeholder="e.g. Ama Mensah" /></label>
            <label>Workforce category<select name="staffCategorySelect" value={categoryId} onChange={(e) => changeCategory(e.target.value)}>{STAFF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>{isCustom ? "Role name" : "Role"}{isCustom ? <input name="customRole" required value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="e.g. School Photographer" /> : <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{category.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}</label>
            <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@school.com" /></label>
            <label>Phone<input name="phone" autoComplete="tel" placeholder="024 xxx xxxx" /></label>
            {isTeaching ? <>
              <label>Primary class<select name="primaryClassId" defaultValue=""><option value="">No class lead yet</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.level ? `${x.level} · ` : ""}{x.name}</option>)}</select></label>
              <label>Primary subject<select name="subjectId" defaultValue=""><option value="">No subject assignment yet</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </> : <div className="staff-permission-preview"><span>Role scope</span><b>{isCustom ? (customRole || "Custom role") : selectedRole?.name}</b><small>{isCustom ? "A custom responsibility. Refine exact permissions from Roles & Permissions after creating the account." : selectedRole?.description}</small><div className="staff-access-tags">{(selectedRole?.access ?? []).map((item) => <em key={item}>{item}</em>)}</div></div>}
          </div>
          {isTeaching ? <div className="staff-role-explainer"><div><span>Selected responsibility</span><b>{selectedRole?.name}</b><small>{selectedRole?.description}</small></div><div className="staff-access-tags">{(selectedRole?.access ?? []).map((item) => <em key={item}>{item}</em>)}</div></div> : null}
          <div className="staff-taxonomy-note"><span>◎</span><div><b>{category.label}</b><small>{category.description} The account gets its login identity here; operational permissions should always be granted by the Owner or an authorised administrator through Roles & Permissions.</small></div></div>
          <div className="staff-credential-note"><span>🔐</span><div><b>Temporary login password: 12345</b><small>The staff member should change it immediately in Account Security. Their login still requires the school's unique code.</small></div></div>
          <div className="staff-modal-actions"><button className="staff-secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="staff-primary-button" disabled={pending || (isCustom && !customRole.trim())} type="submit">{pending ? "Creating account…" : "Create account →"}</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
