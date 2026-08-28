"use client";

import { useState, useTransition } from "react";
import { createStaff } from "./actions";

type Item = { id: string; name: string; level?: string | null };

export function StaffCreateDialog({ classes, subjects }: { classes: Item[]; subjects: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);
  const [staffType, setStaffType] = useState("teaching");
  const [role, setRole] = useState("Teacher");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const response = await createStaff(form);
      if (response.ok) setResult({ ok: true, message: `Created ${response.name}. Login: ${response.username}. Temporary password: ${response.temporaryPassword}.` });
      else setResult({ ok: false, message: response.message });
    });
  }

  return <>
    <button className="staff-primary-cta" type="button" onClick={() => { setOpen(true); setResult(null); }}><span>＋</span> Add staff member</button>
    {open ? <div className="staff-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
        <div className="staff-modal-head"><div><span>STAFF SETUP</span><h2 id="staff-dialog-title">Create a school account</h2><p>Every person gets their own login. Enter only what is needed for the role, then refine permissions later.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        {result ? <div className={result.ok ? "staff-result success" : "staff-result error"}>{result.message}{result.ok ? <button type="button" onClick={() => window.location.reload()}>Refresh directory</button> : null}</div> : null}
        <form onSubmit={submit}>
          <div className="staff-form-grid">
            <label>Full name<input name="name" required placeholder="e.g. Ama Mensah" /></label>
            <label>Staff category<select name="staffType" value={staffType} onChange={(e) => { setStaffType(e.target.value); if (e.target.value === "non-teaching") setRole("Accountant"); else setRole("Teacher"); }}><option value="teaching">Teaching staff</option><option value="non-teaching">Non-teaching staff</option></select></label>
            <label>Role<select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{(staffType === "teaching" ? ["Teacher","Assistant Teacher","Head of Department","Academic Lead"] : ["Administrator","Accountant / Bursar","Secretary / Front Desk","Driver","Security Officer","Catering / Cook","Librarian","Cleaner / Support"]).map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@school.com" /></label>
            <label>Phone<input name="phone" autoComplete="tel" placeholder="024 xxx xxxx" /></label>
            {staffType === "teaching" ? <>
              <label>Primary class<select name="primaryClassId" defaultValue=""><option value="">No class lead yet</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.level ? `${x.level} · ` : ""}{x.name}</option>)}</select></label>
              <label>Primary subject<select name="subjectId" defaultValue=""><option value="">No subject assignment yet</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </> : <div className="staff-permission-preview"><span>Role scope</span><b>{role}</b><small>{role.includes("Accountant") ? "Finance, receipts, reconciliation and payroll workflows." : role === "Administrator" ? "Broad school operations without Owner-level control." : "Focused operational access for the assigned department."}</small></div>}
          </div>
          <div className="staff-credential-note"><span>🔐</span><div><b>Temporary login password: 12345</b><small>The staff member should change it immediately in Account Security. Their login still requires the school's unique code.</small></div></div>
          <div className="staff-modal-actions"><button className="staff-secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="staff-primary-button" disabled={pending} type="submit">{pending ? "Creating account…" : "Create account →"}</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
