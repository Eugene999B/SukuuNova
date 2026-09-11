"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, ChevronRight, FileText, Plus, RefreshCw, Search, ShieldCheck, UsersRound, WalletCards, X } from "lucide-react";
import "./finance-workspace.css";

type Staff = { id: string; name: string; email?: string | null };
type DeductionDraft = { label: string; type: "fixed" | "percent"; value: string };
type Structure = { id: string; staffId: string; grossSalary: number | string; deductions: unknown; staff?: { name: string } | null };
type Run = { id: string; period: string; status: string };
type Payslip = { id: string; staffId: string; gross: number | string; net: number | string; payrollRun?: { period: string } | null; staff?: { name: string } | null };
type PayrollData = { canManage: boolean; staff: Staff[]; structures: Structure[]; runs: Run[]; payslips: Payslip[] };

type Drawer = "salary" | "run" | null;
const nav = [["Overview", "/school/fees/overview"], ["Fee setup", "/school/fees/fees"], ["Invoices", "/school/fees/invoices"], ["Payments", "/school/fees/payments"], ["Arrears", "/school/fees/arrears"], ["Reports", "/school/fees/reports"], ["Payroll", "/school/fees/payroll"]] as const;
const emptyDeduction = (): DeductionDraft => ({ label: "", type: "percent", value: "" });
function list<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function number(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return `GHS ${number(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function normalize(payload: unknown): PayrollData { const source = object(payload); return { canManage: source.canManage === true, staff: list<Staff>(source.staff), structures: list<Structure>(source.structures), runs: list<Run>(source.runs), payslips: list<Payslip>(source.payslips) }; }
function periodLabel(value: unknown) { const period = String(value ?? ""); const [year, month] = period.split("-").map(Number); if (!year || !month || month < 1 || month > 12) return period || "Payroll"; const date = new Date(Date.UTC(year, month - 1, 1)); try { return new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric" }).format(date); } catch { return period; } }
function deductionValue(row: { amount?: unknown; type?: unknown; value?: unknown }, gross: number) { if (row.amount !== undefined) return Math.max(0, number(row.amount)); const value = Math.max(0, number(row.value)); return row.type === "percent" ? gross * value / 100 : value; }

export default function PayrollWorkspaceSafe({ schoolName = "School" }: { schoolName?: string }) {
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffId, setStaffId] = useState("");
  const [gross, setGross] = useState("");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [deductions, setDeductions] = useState<DeductionDraft[]>([emptyDeduction(), emptyDeduction(), emptyDeduction()]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phase2/payroll", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) { const details = object(payload); throw new Error(String(details.error ?? details.message ?? "Payroll could not be loaded.")); }
      setData(normalize(payload));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Payroll could not be loaded.");
    } finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function post(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/phase2/payroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) { const details = object(payload); throw new Error(String(details.error ?? details.message ?? "Payroll action failed.")); }
      await load(true);
      setDrawer(null);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll action failed.");
      return false;
    } finally { setBusy(false); }
  }

  const filteredStructures = useMemo(() => (data?.structures ?? []).filter((row) => !query.trim() || `${row.staff?.name ?? ""} ${row.staffId}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const filteredRuns = useMemo(() => (data?.runs ?? []).filter((row) => !statusFilter || row.status === statusFilter), [data, statusFilter]);
  const grossTotal = (data?.structures ?? []).reduce((sum, row) => sum + number(row.grossSalary), 0);
  const latestRun = data?.runs?.[0];

  function openSalary(structure?: Structure) {
    if (!structure) {
      setStaffId(""); setGross(""); setDeductions([emptyDeduction(), emptyDeduction(), emptyDeduction()]);
    } else {
      setStaffId(structure.staffId);
      setGross(String(structure.grossSalary ?? ""));
      const rows = list<Record<string, unknown>>(structure.deductions).map((row) => ({ label: String(row.label ?? "Deduction"), type: row.type === "fixed" ? "fixed" as const : "percent" as const, value: String(row.value ?? "") }));
      setDeductions([...rows, emptyDeduction(), emptyDeduction()].slice(0, 5));
    }
    setDrawer("salary");
  }
  async function saveStructure(event: FormEvent) {
    event.preventDefault();
    if (!staffId || number(gross) <= 0) return setError("Choose a staff member and enter a valid gross salary.");
    const parsed = deductions.filter((row) => row.label.trim() || row.value.trim()).map((row) => ({ label: row.label.trim() || "Deduction", type: row.type, value: number(row.value) })).filter((row) => row.value > 0);
    if (parsed.filter((row) => row.type === "percent").reduce((sum, row) => sum + row.value, 0) > 100) return setError("Percentage deductions cannot total more than 100%.");
    await post({ action: "salaryStructure", staffId, grossSalary: number(gross), deductions: parsed }, "Salary structure saved.");
  }

  if (loading) return <div className="fin-shell"><div className="fin-state"><RefreshCw className="fin-spin" size={20} /><strong>Loading payroll workspace</strong><span>Reading salary structures, pay runs and payslips…</span></div></div>;
  if (!data) return <div className="fin-shell"><div className="fin-state error"><WalletCards size={24} /><strong>Payroll could not be loaded.</strong><span>{error || "The payroll feature may not be enabled or your account may not have access."}</span><button type="button" onClick={() => void load()}>Try again</button></div></div>;

  return <div className="fin-shell">
    <section className="fin-hero"><div className="fin-hero-copy"><span>{String(schoolName || "School").toUpperCase()} · FINANCE</span><h1>Payroll</h1><p>Salary structures, monthly pay runs and authorised payslips with actions opened only when needed.</p></div><div className="fin-hero-actions"><Link className="fin-secondary" href="/school/staff"><UsersRound size={15} /> Staff directory</Link>{data.canManage ? <><button className="fin-secondary" type="button" onClick={() => setDrawer("run")}><Plus size={15} /> New pay run</button><button className="fin-primary" type="button" onClick={() => openSalary()}><Plus size={15} /> Salary structure</button></> : null}</div></section>
    <nav className="fin-nav" aria-label="Finance sections">{nav.map(([label, href]) => <Link key={href} href={href} className={href.endsWith("/payroll") ? "active" : ""}>{label}</Link>)}</nav>
    {error ? <div className="fin-alert error"><X size={16} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div> : null}
    {notice ? <div className="fin-alert success"><CheckCircle2 size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div> : null}

    <section className="fin-metrics"><article><span className="fin-metric-icon"><UsersRound size={18} /></span><div><small>Staff on payroll</small><strong>{data.structures.length}</strong><p>Salary structures</p></div></article><article><span className="fin-metric-icon"><Banknote size={18} /></span><div><small>Gross monthly</small><strong>{money(grossTotal)}</strong><p>Before deductions</p></div></article><article><span className="fin-metric-icon"><WalletCards size={18} /></span><div><small>Latest pay run</small><strong>{latestRun ? periodLabel(latestRun.period) : "None"}</strong><p>{latestRun?.status || "No payroll run yet"}</p></div></article><article><span className="fin-metric-icon"><FileText size={18} /></span><div><small>Payslips</small><strong>{data.payslips.length}</strong><p>Generated records</p></div></article></section>

    <section className="fin-overview-grid"><section className="fin-card"><div className="fin-card-head"><div><span>PAY RUN CONTROL</span><h2>Recent payroll runs</h2></div></div><div className="fin-method-list">{data.runs.slice(0, 6).map((run) => <div key={run.id}><span><strong>{periodLabel(run.period)}</strong><small>{run.status}</small></span><div className="fin-inline-actions">{data.canManage && run.status === "draft" ? <button className="fin-collect" type="button" disabled={busy} onClick={() => void post({ action: "processRun", payrollRunId: run.id }, `${periodLabel(run.period)} payroll processed.`)}>Process</button> : null}{data.canManage && run.status === "processed" ? <button className="fin-collect" type="button" disabled={busy} onClick={() => void post({ action: "markPaid", payrollRunId: run.id }, `${periodLabel(run.period)} payroll marked paid.`)}>Mark paid</button> : null}<span className={`fin-status ${run.status === "paid" ? "paid" : run.status === "processed" ? "partial" : "unpaid"}`}>{run.status}</span></div></div>)}{!data.runs.length ? <div className="fin-empty">No payroll runs yet.</div> : null}</div></section><section className="fin-card"><div className="fin-card-head"><div><span>PAYSLIPS</span><h2>Recent issued payslips</h2></div></div><div className="fin-compact-list">{data.payslips.slice(0, 6).map((payslip) => <Link className="fin-payslip-link" key={payslip.id} href={`/school/fees/payroll/payslips/${payslip.id}/print`} target="_blank"><span><strong>{payslip.staff?.name || "Staff payslip"}</strong><small>{periodLabel(payslip.payrollRun?.period)}</small></span><b>{money(payslip.net)}</b><ChevronRight size={15} /></Link>)}{!data.payslips.length ? <div className="fin-empty">No payslips issued yet.</div> : null}</div></section></section>

    {data.canManage ? <section className="fin-card"><div className="fin-card-head"><div><span>SALARY REGISTER</span><h2>Staff salary structures</h2><p>Search and open only the salary record you need to change.</p></div><label className="fin-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff…" /></label></div><div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Staff</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net estimate</th><th></th></tr></thead><tbody>{filteredStructures.map((structure) => { const grossValue = number(structure.grossSalary); const rows = list<Record<string, unknown>>(structure.deductions); const deductionsTotal = rows.reduce((sum, row) => sum + deductionValue(row, grossValue), 0); return <tr key={structure.id}><td><strong>{structure.staff?.name || structure.staffId}</strong></td><td className="num">{money(grossValue)}</td><td className="num">{money(deductionsTotal)}</td><td className="num strong">{money(Math.max(0, grossValue - deductionsTotal))}</td><td className="action"><button className="fin-row-action" type="button" onClick={() => openSalary(structure)}>Edit <ChevronRight size={14} /></button></td></tr>; })}{!filteredStructures.length ? <tr><td colSpan={5}><div className="fin-empty">No salary structures match this search.</div></td></tr> : null}</tbody></table></div></section> : <section className="fin-card"><div className="fin-state"><ShieldCheck size={22} /><strong>Payroll view only</strong><span>Your account can view authorised payslips but cannot manage school-wide payroll.</span></div></section>}

    {data.canManage ? <section className="fin-card"><div className="fin-card-head"><div><span>RUN REGISTER</span><h2>Payroll history</h2></div><select className="fin-standalone-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="processed">Processed</option><option value="paid">Paid</option></select></div><div className="fin-method-list">{filteredRuns.map((run) => <div key={run.id}><span><strong>{periodLabel(run.period)}</strong><small>Payroll run</small></span><span className={`fin-status ${run.status === "paid" ? "paid" : run.status === "processed" ? "partial" : "unpaid"}`}>{run.status}</span></div>)}{!filteredRuns.length ? <div className="fin-empty">No payroll runs match this status.</div> : null}</div></section> : null}

    {drawer ? <div className="fin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="fin-drawer" role="dialog" aria-modal="true"><button className="fin-close" type="button" onClick={() => setDrawer(null)}><X size={18} /></button>{drawer === "run" ? <form className="fin-form" onSubmit={async (event) => { event.preventDefault(); await post({ action: "createRun", period }, "Payroll run created as draft."); }}><span className="fin-drawer-kicker">PAY RUN</span><h2>Create monthly payroll run</h2><label>Payroll month<input type="month" required value={period} onChange={(e) => setPeriod(e.target.value)} /></label><button className="fin-primary" disabled={busy}>{busy ? "Creating…" : "Create draft run"}</button></form> : null}{drawer === "salary" ? <form className="fin-form" onSubmit={saveStructure}><span className="fin-drawer-kicker">SALARY SETUP</span><h2>Set salary structure</h2><label>Staff member<select required value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Choose staff</option>{data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}{staff.email ? ` · ${staff.email}` : ""}</option>)}</select></label><label>Gross salary (GHS)<input required type="number" min="0.01" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} /></label><div className="fin-detail-section"><h3>Recurring deductions</h3>{deductions.map((row, index) => <div className="fin-form" key={index}><label>Deduction label<input value={row.label} onChange={(e) => setDeductions((current) => current.map((item, position) => position === index ? { ...item, label: e.target.value } : item))} /></label><label>Type<select value={row.type} onChange={(e) => setDeductions((current) => current.map((item, position) => position === index ? { ...item, type: e.target.value === "fixed" ? "fixed" : "percent" } : item))}><option value="percent">Percent</option><option value="fixed">Fixed</option></select></label><label>Value<input type="number" min="0" step="0.01" value={row.value} onChange={(e) => setDeductions((current) => current.map((item, position) => position === index ? { ...item, value: e.target.value } : item))} /></label></div>)}</div><button className="fin-primary" disabled={busy}>{busy ? "Saving…" : "Save salary structure"}</button></form> : null}</aside></div> : null}
  </div>;
}
