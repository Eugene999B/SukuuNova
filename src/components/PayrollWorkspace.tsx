"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Banknote, ChevronRight, FileText, Plus, RefreshCw, Search, UsersRound, WalletCards, X, CheckCircle2, ShieldCheck } from "lucide-react";
import "./finance-workspace.css";

type Staff = { id: string; name: string; email?: string | null };
type DeductionRow = { label: string; type: "fixed" | "percent"; value: string };
type Structure = { id: string; staffId: string; grossSalary: number | string; deductions: unknown; staff?: { name: string } };
type Run = { id: string; period: string; status: string };
type Payslip = { id: string; staffId: string; gross: number | string; net: number | string; payrollRun?: { period: string }; staff?: { name: string } };
type Data = { canManage: boolean; staff: Staff[]; structures: Structure[]; runs: Run[]; payslips: Payslip[] };
type Drawer = "salary" | "run" | null;

const nav = [
  ["Overview", "/school/fees/overview"],
  ["Fee setup", "/school/fees/fees"],
  ["Invoices", "/school/fees/invoices"],
  ["Payments", "/school/fees/payments"],
  ["Arrears", "/school/fees/arrears"],
  ["Reports", "/school/fees/reports"],
  ["Payroll", "/school/fees/payroll"],
] as const;
const money = (value: number | string) => `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyDeduction = (): DeductionRow => ({ label: "", type: "percent", value: "" });
const deductionAmount = (row: { type?: string; value?: number | string; amount?: number | string }, gross: number) => {
  if (row.amount !== undefined) return Math.round(Number(row.amount || 0) * 100) / 100;
  const value = Number(row.value || 0);
  return row.type === "percent" ? Math.round(gross * value) / 100 : Math.round(value * 100) / 100;
};
const periodLabel = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

export default function PayrollWorkspace({ schoolName }: { schoolName: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffId, setStaffId] = useState("");
  const [gross, setGross] = useState("");
  const [deductions, setDeductions] = useState<DeductionRow[]>([emptyDeduction(), emptyDeduction(), emptyDeduction()]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phase2/payroll", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? payload?.message ?? "Payroll could not be loaded.");
      setData(payload as Data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function post(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/phase2/payroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? payload?.message ?? "Payroll action failed.");
      await load(true);
      setNotice(success);
      setDrawer(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const filteredStructures = useMemo(() => (data?.structures ?? []).filter((row) => !query.trim() || `${row.staff?.name ?? ""} ${row.staffId}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const filteredRuns = useMemo(() => (data?.runs ?? []).filter((row) => !statusFilter || row.status === statusFilter), [data, statusFilter]);
  const grossTotal = (data?.structures ?? []).reduce((sum, row) => sum + Number(row.grossSalary || 0), 0);
  const latestRun = data?.runs?.[0];

  const updateDeduction = (index: number, patch: Partial<DeductionRow>) => setDeductions((current) => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  const openSalary = (structure?: Structure) => {
    if (structure) {
      setStaffId(structure.staffId);
      setGross(String(structure.grossSalary));
      const rows = Array.isArray(structure.deductions) ? (structure.deductions as Array<{ label?: string; type?: string; value?: number | string }>).map((row) => ({ label: row.label ?? "Deduction", type: row.type === "fixed" ? "fixed" as const : "percent" as const, value: String(row.value ?? "") })) : [];
      setDeductions([...rows, emptyDeduction(), emptyDeduction()].slice(0, 5));
    } else {
      setStaffId(""); setGross(""); setDeductions([emptyDeduction(), emptyDeduction(), emptyDeduction()]);
    }
    setDrawer("salary");
  };
  const saveStructure = async (event: FormEvent) => {
    event.preventDefault();
    if (!staffId || !gross) return setError("Choose a staff member and enter the gross salary.");
    const parsed = deductions.filter((row) => row.label.trim() || row.value.trim()).map((row) => ({ label: row.label.trim() || "Deduction", type: row.type, value: Number(row.value) })).filter((row) => row.value > 0);
    if (parsed.filter((row) => row.type === "percent").reduce((sum, row) => sum + row.value, 0) > 100) return setError("Percentage deductions cannot total more than 100%.");
    if (await post({ action: "salaryStructure", staffId, grossSalary: Number(gross), deductions: parsed }, "Salary structure saved.")) {
      setStaffId(""); setGross(""); setDeductions([emptyDeduction(), emptyDeduction(), emptyDeduction()]);
    }
  };
  const createRun = async (event: FormEvent) => { event.preventDefault(); await post({ action: "createRun", period }, "Payroll run created as draft."); };

  if (loading) return <div className="fin-shell"><div className="fin-state"><RefreshCw className="fin-spin" size={20} /><strong>Loading payroll workspace</strong><span>Reading salary structures, pay runs and payslips…</span></div></div>;
  if (!data) return <div className="fin-shell"><div className="fin-state error"><WalletCards size={24} /><strong>Payroll could not be opened.</strong><span>{error || "The payroll feature may not be enabled for this school or your account may not have access."}</span><button type="button" onClick={() => void load()}>Try again</button></div></div>;

  return <div className="fin-shell">
    <section className="fin-hero"><div className="fin-hero-copy"><span>{schoolName.toUpperCase()} · FINANCE</span><h1>Payroll</h1><p>Manage recurring salary structures, monthly payroll runs and authorised payslips without mixing payroll into student billing.</p></div><div className="fin-hero-actions"><Link href="/school/staff" className="fin-secondary"><UsersRound size={15} /> Staff directory</Link>{data.canManage ? <><button type="button" className="fin-secondary" onClick={() => setDrawer("run")}><Plus size={15} /> New pay run</button><button type="button" className="fin-primary" onClick={() => openSalary()}><Plus size={15} /> Salary structure</button></> : null}</div></section>
    <nav className="fin-nav" aria-label="Finance sections">{nav.map(([label, href]) => <Link key={href} href={href} className={href.endsWith("/payroll") ? "active" : ""}>{label}</Link>)}</nav>
    {error ? <div className="fin-alert error"><X size={16} /><span>{error}</span><button type="button" onClick={() => setError("")}><X size={14} /></button></div> : null}
    {notice ? <div className="fin-alert success"><CheckCircle2 size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}><X size={14} /></button></div> : null}

    <section className="fin-metrics"><article><span className="fin-metric-icon"><UsersRound size={18} /></span><div><small>Staff on payroll</small><strong>{data.structures.length}</strong><p>Salary structures</p></div></article><article><span className="fin-metric-icon"><Banknote size={18} /></span><div><small>Gross monthly payroll</small><strong>{money(grossTotal)}</strong><p>Before deductions</p></div></article><article><span className="fin-metric-icon"><WalletCards size={18} /></span><div><small>Latest pay run</small><strong>{latestRun ? periodLabel(latestRun.period) : "None"}</strong><p>{latestRun ? latestRun.status : "No payroll run yet"}</p></div></article><article><span className="fin-metric-icon"><FileText size={18} /></span><div><small>Payslips</small><strong>{data.payslips.length}</strong><p>Generated records</p></div></article></section>

    <section className="fin-overview-grid">
      <div className="fin-card"><div className="fin-card-head"><div><span>PAY RUN CONTROL</span><h2>Recent payroll runs</h2><p>Only the latest runs are shown here. Filter the register below for older periods.</p></div></div><div className="fin-compact-list">{data.runs.slice(0, 6).map((run) => <div className="fin-payrun-row" key={run.id}><span><strong>{periodLabel(run.period)}</strong><small>{run.status}</small></span><div>{data.canManage && run.status === "draft" ? <button type="button" className="fin-collect" disabled={busy} onClick={() => void post({ action: "processRun", payrollRunId: run.id }, `${periodLabel(run.period)} payroll processed and payslips generated.`)}>Process</button> : null}{data.canManage && run.status === "processed" ? <button type="button" className="fin-collect" disabled={busy} onClick={() => void post({ action: "markPaid", payrollRunId: run.id }, `${periodLabel(run.period)} payroll marked paid.`)}>Mark paid</button> : null}<span className={`fin-status ${run.status === "paid" ? "paid" : run.status === "processed" ? "partial" : "unpaid"}`}>{run.status}</span></div></div>)}{!data.runs.length ? <div className="fin-empty">No payroll runs yet.</div> : null}</div></div>
      <div className="fin-card"><div className="fin-card-head"><div><span>PAYSLIPS</span><h2>Recent issued payslips</h2><p>Open a print-ready copy only when needed.</p></div></div><div className="fin-compact-list">{data.payslips.slice(0, 6).map((payslip) => <Link className="fin-payslip-link" key={payslip.id} href={`/school/fees/payroll/payslips/${payslip.id}/print`} target="_blank"><span><strong>{payslip.staff?.name ?? "Staff payslip"}</strong><small>{payslip.payrollRun?.period ? periodLabel(payslip.payrollRun.period) : "Payroll"}</small></span><b>{money(payslip.net)}</b><ChevronRight size={15} /></Link>)}{!data.payslips.length ? <div className="fin-empty">No payslips issued yet.</div> : null}</div></div>
    </section>

    {data.canManage ? <section className="fin-card"><div className="fin-card-head"><div><span>SALARY REGISTER</span><h2>Staff salary structures</h2><p>Search the recurring salary register and open a staff row only when it needs updating.</p></div><label className="fin-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff…" /></label></div><div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Staff</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net estimate</th><th></th></tr></thead><tbody>{filteredStructures.slice(0, 50).map((structure) => { const grossValue = Number(structure.grossSalary); const rows = Array.isArray(structure.deductions) ? structure.deductions as Array<{ amount?: number | string; type?: string; value?: number | string }> : []; const deductionsTotal = rows.reduce((sum, row) => sum + deductionAmount(row, grossValue), 0); return <tr key={structure.id}><td><strong>{structure.staff?.name ?? structure.staffId}</strong></td><td className="num">{money(structure.grossSalary)}</td><td className="num">{money(deductionsTotal)}</td><td className="num strong success-text">{money(Math.max(0, grossValue - deductionsTotal))}</td><td className="action"><button type="button" className="fin-row-action" onClick={() => openSalary(structure)}>Edit <ChevronRight size={14} /></button></td></tr>; })}{!filteredStructures.length ? <tr><td colSpan={5}><div className="fin-empty">No salary structures match this search.</div></td></tr> : null}</tbody></table></div></section> : <section className="fin-card"><div className="fin-state"><ShieldCheck size={22} /><strong>Payroll view only</strong><span>Your account can view authorised payslips but cannot manage school-wide salary structures or payroll runs.</span></div></section>}

    {data.canManage ? <section className="fin-card"><div className="fin-card-head"><div><span>RUN REGISTER</span><h2>Payroll history</h2><p>Filter pay runs by workflow status.</p></div><select className="fin-standalone-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="processed">Processed</option><option value="paid">Paid</option></select></div><div className="fin-method-list">{filteredRuns.map((run) => <div key={run.id}><span><strong>{periodLabel(run.period)}</strong><small>Payroll run</small></span><span className={`fin-status ${run.status === "paid" ? "paid" : run.status === "processed" ? "partial" : "unpaid"}`}>{run.status}</span></div>)}{!filteredRuns.length ? <div className="fin-empty">No payroll runs match this status.</div> : null}</div></section> : null}

    {drawer ? <div className="fin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="fin-drawer" role="dialog" aria-modal="true" aria-label="Payroll action"><button type="button" className="fin-close" onClick={() => setDrawer(null)}><X size={18} /></button>{drawer === "salary" ? <><span className="fin-drawer-kicker">SALARY STRUCTURE</span><h2>Set recurring salary</h2><p>Store the approved gross salary and recurring deductions for one staff account.</p><form className="fin-form" onSubmit={saveStructure}><label>Staff member<select required value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Choose staff</option>{data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}{staff.email ? ` · ${staff.email}` : ""}</option>)}</select></label><label>Gross salary (GHS)<input required type="number" min="0.01" step="0.01" value={gross} onChange={(event) => setGross(event.target.value)} /></label><div className="fin-deduction-list"><div><strong>Recurring deductions</strong><button type="button" onClick={() => setDeductions((rows) => rows.length < 8 ? [...rows, emptyDeduction()] : rows)}>+ Add deduction</button></div>{deductions.map((row, index) => <div className="fin-deduction-row" key={index}><input value={row.label} onChange={(event) => updateDeduction(index, { label: event.target.value })} placeholder="e.g. SSNIT" aria-label={`Deduction ${index + 1} label`} /><select value={row.type} onChange={(event) => updateDeduction(index, { type: event.target.value as DeductionRow["type"] })}><option value="percent">Percent</option><option value="fixed">Fixed GHS</option></select><input type="number" min="0" step="0.01" value={row.value} onChange={(event) => updateDeduction(index, { value: event.target.value })} placeholder={row.type === "percent" ? "%" : "GHS"} aria-label={`Deduction ${index + 1} value`} /></div>)}</div><button className="fin-primary" disabled={busy}>{busy ? "Saving…" : "Save salary structure"}</button></form></> : <><span className="fin-drawer-kicker">PAY RUN</span><h2>Create monthly payroll run</h2><p>Create the period as a draft first. Processing later generates payslips from the current salary structures.</p><form className="fin-form" onSubmit={createRun}><label>Payroll month<input required type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label><div className="fin-form-note"><ShieldCheck size={15} /> A draft run does not mark salaries paid. Processing and payment are separate controlled steps.</div><button className="fin-primary" disabled={busy}>{busy ? "Creating…" : "Create draft pay run"}</button></form></>}</aside></div> : null}
  </div>;
}
