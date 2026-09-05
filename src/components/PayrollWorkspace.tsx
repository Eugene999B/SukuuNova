"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "./finance-workspace.css";

type Staff = { id: string; name: string; email?: string | null };
type DeductionRow = { label: string; type: "fixed" | "percent"; value: string };
type Structure = { id: string; staffId: string; grossSalary: number | string; deductions: unknown; staff?: { name: string } };
type Run = { id: string; period: string; status: string };
type Payslip = { id: string; staffId: string; gross: number | string; net: number | string; payrollRun?: { period: string } };
type Data = { canManage: boolean; staff: Staff[]; structures: Structure[]; runs: Run[]; payslips: Payslip[] };

const money = (n: number | string) => `GH₵ ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyDeduction = (): DeductionRow => ({ label: "", type: "percent", value: "" });

function deductionAmount(row: { type?: string; value?: number | string; amount?: number | string }, gross: number) {
  if (row.amount !== undefined) return Number(row.amount || 0);
  const value = Number(row.value || 0);
  return row.type === "percent" ? gross * value / 100 : value;
}

export default function PayrollWorkspace({ schoolName }: { schoolName: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [staffId, setStaffId] = useState("");
  const [gross, setGross] = useState("");
  const [deductions, setDeductions] = useState<DeductionRow[]>([emptyDeduction(), emptyDeduction(), emptyDeduction()]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  async function load() {
    setBusy(true);
    try {
      const r = await fetch("/api/phase2/payroll", { cache: "no-store" });
      if (!r.ok) throw new Error("Payroll could not be loaded.");
      setData(await r.json());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Payroll could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function post(body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/phase2/payroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Payroll action failed.");
      setNotice("Saved successfully.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Payroll action failed.");
    } finally {
      setBusy(false);
    }
  }

  const updateDeduction = (index: number, patch: Partial<DeductionRow>) => {
    setDeductions((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  };

  const saveStructure = (e: FormEvent) => {
    e.preventDefault();
    if (!staffId || !gross) return setNotice("Choose a staff member and enter gross salary.");
    const parsedDeductions = deductions
      .filter((row) => row.label.trim() || row.value.trim())
      .map((row) => ({ label: row.label.trim() || "Deduction", type: row.type, value: Number(row.value) }))
      .filter((row) => row.value > 0);
    const percentTotal = parsedDeductions.filter((row) => row.type === "percent").reduce((sum, row) => sum + row.value, 0);
    if (percentTotal > 100) {
      return setNotice("Total percentage deductions cannot exceed 100%.");
    }
    void post({ action: "salaryStructure", staffId, grossSalary: Number(gross), deductions: parsedDeductions });
  };

  const salaryTotal = (data?.structures ?? []).reduce((s, r) => s + Number(r.grossSalary), 0);

  if (!data) return <div className="finance-app"><div className="finance-loading">{notice || "Loading payroll…"}</div></div>;

  return <div className="finance-app">
    <section className="finance-hero"><div><span className="finance-kicker">{schoolName ? `${schoolName.toUpperCase()} · ` : ""}STAFF FINANCE</span><h1>Payroll & Salaries</h1><p>Set salary structures, record approved deductions, run monthly payroll, and keep payslips tied to the correct staff member.</p></div><div className="finance-hero-actions"><Link href="/school/fees">Finance overview</Link><Link href="/school/staff">Staff directory</Link></div></section>
    {notice && <div className="finance-notice">{notice}</div>}
    <section className="finance-metrics"><div><span>Staff on payroll</span><strong>{data.structures.length}</strong><small>Salary structures</small></div><div><span>Gross monthly</span><strong>{money(salaryTotal)}</strong><small>Before deductions</small></div><div><span>Payroll runs</span><strong>{data.runs.length}</strong><small>Saved periods</small></div><div><span>Payslips</span><strong>{data.payslips.length}</strong><small>Generated records</small></div></section>
    {data.canManage ? <section className="finance-grid">
      <div className="finance-panel"><span className="finance-kicker">SALARY SETUP</span><h2>Set or update salary</h2><p>Choose a staff account and store its recurring gross salary and approved deductions.</p>
        <form className="finance-form" onSubmit={saveStructure}>
          <select value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">Staff member</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.email ? ` · ${s.email}` : ""}</option>)}</select>
          <input type="number" min="0.01" step="0.01" value={gross} onChange={e => setGross(e.target.value)} placeholder="Gross salary (GH₵)" />
          <div style={{ display: "grid", gap: 8 }}>
            <strong>Recurring deductions</strong>
            {deductions.map((row, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .9fr", gap: 8 }}>
              <input value={row.label} onChange={e => updateDeduction(index, { label: e.target.value })} placeholder={`Deduction ${index + 1} · e.g. SSNIT`} aria-label={`Deduction ${index + 1} label`} />
              <select value={row.type} onChange={e => updateDeduction(index, { type: e.target.value as DeductionRow["type"] })} aria-label={`Deduction ${index + 1} type`}><option value="percent">Percent</option><option value="fixed">Fixed</option></select>
              <input type="number" min="0" step="0.01" value={row.value} onChange={e => updateDeduction(index, { value: e.target.value })} placeholder={row.type === "percent" ? "Value %" : "Value GH₵"} aria-label={`Deduction ${index + 1} value`} />
            </div>)}
          </div>
          <button disabled={busy}>Save salary structure</button>
        </form>
      </div>
      <div className="finance-panel finance-accent"><span className="finance-kicker">RUN CONTROL</span><h2>Create monthly run</h2><form className="finance-form" onSubmit={e => { e.preventDefault(); void post({ action: "createRun", period }); }}><input type="month" value={period} onChange={e => setPeriod(e.target.value)} /><button disabled={busy}>Create run</button></form><p style={{ marginTop: 12 }}>Process a draft to generate payslips. Mark a processed run paid only after the school has completed its payment/reconciliation step.</p></div>
    </section> : <section className="finance-panel"><div className="finance-empty"><strong>Payroll view only</strong><br />This account can see its authorised payroll information but cannot change school-wide salary structures or runs.</div></section>}
    <section className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">PAYSLIPS</span><h2>Issued payslips</h2><p>Open a school-branded, print-ready copy for any payslip you are authorised to view.</p></div></div><div className="finance-payroll-list">{data.payslips.map(p => <article key={p.id}><div><b>{p.payrollRun?.period ?? "Payroll"}</b><span>{money(p.net)}</span></div><Link className="app-action" href={`/school/fees/payroll/payslips/${p.id}/print`}>Print / Save PDF</Link></article>)}{!data.payslips.length && <div className="finance-empty">No payslips have been issued yet.</div>}</div></section>
    <section className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">PAYROLL REGISTER</span><h2>Salary structures</h2></div></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Staff</th><th>Gross</th><th>Deductions</th><th>Net estimate</th></tr></thead><tbody>{data.structures.map(s => { const grossValue = Number(s.grossSalary); const ds = Array.isArray(s.deductions) ? s.deductions as Array<{ amount?: number | string; type?: string; value?: number | string }> : []; const ded = ds.reduce((n, d) => n + deductionAmount(d, grossValue), 0); return <tr key={s.id}><td><b>{s.staff?.name ?? s.staffId}</b></td><td>{money(s.grossSalary)}</td><td>{money(ded)}</td><td className="paid">{money(Math.max(0, grossValue - ded))}</td></tr>; })}{!data.structures.length && <tr><td colSpan={4}><div className="finance-empty">No salary structures have been configured yet.</div></td></tr>}</tbody></table></div></section>
    <section className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">RUN HISTORY</span><h2>Payroll runs</h2></div></div><div className="finance-payroll-list">{data.runs.map(r => <article key={r.id}><div><b>{r.period}</b><span>{r.status}</span></div>{data.canManage && r.status === "draft" && <button disabled={busy} onClick={() => void post({ action: "processRun", payrollRunId: r.id })}>Process</button>}{data.canManage && r.status === "processed" && <button disabled={busy} onClick={() => void post({ action: "markPaid", payrollRunId: r.id })}>Mark paid</button>}</article>)}{!data.runs.length && <div className="finance-empty">No payroll runs yet.</div>}</div></section>
  </div>;
}
