"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Filter,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import "./finance-workspace.css";

type Mode = "overview" | "fees" | "invoices" | "payments" | "arrears" | "reports";
type Term = { id: string; name: string; academicYear?: { name: string } | null };
type ClassRow = { id: string; name: string };
type Student = { id: string; name: string; admissionNo: string; classId?: string | null; class?: { id: string; name: string } | null };
type FeeItem = { id: string; name: string; amount: number | string; termId: string; classId?: string | null; term?: Term | null; class?: ClassRow | null };
type InvoiceLine = { amount: number | string; feeItem?: { id: string; name: string } | null };
type Invoice = { id: string; studentId: string; termId: string; totalAmount: number | string; status: string; createdAt: string; student?: Student | null; term?: Term | null; lines?: InvoiceLine[] };
type Payment = { id: string; invoiceId: string; amount: number | string; method: string; reference?: string | null; createdAt: string; invoice?: { id: string; totalAmount: number | string; status: string; student?: Student | null; term?: Term | null } | null };
type Reversal = { id: string; paymentId: string; amount: number | string; reason?: string | null; reversedBy?: string | null; createdAt: string };
type Permissions = { canWriteFees: boolean; canCreateInvoices: boolean; canRecordPayments: boolean; canReversePayments: boolean; canExportFinance: boolean };
type FinanceData = { feeItems: FeeItem[]; invoices: Invoice[]; payments: Payment[]; reversals: Reversal[]; terms: Term[]; classes: ClassRow[]; students: Student[]; permissions: Permissions };
type InvoiceRow = Invoice & { total: number; paid: number; due: number; statusLabel: "Paid" | "Part paid" | "Unpaid" };
type PaymentRow = Payment & { gross: number; reversed: number; net: number };
type Drawer = { kind: "fee" } | { kind: "invoice" } | { kind: "payment" } | { kind: "invoiceDetail"; id: string } | { kind: "paymentDetail"; id: string } | null;

const nav = [
  ["Overview", "/school/fees/overview", "overview"],
  ["Fee setup", "/school/fees/fees", "fees"],
  ["Invoices", "/school/fees/invoices", "invoices"],
  ["Payments", "/school/fees/payments", "payments"],
  ["Arrears", "/school/fees/arrears", "arrears"],
  ["Reports", "/school/fees/reports", "reports"],
  ["Payroll", "/school/fees/payroll", "payroll"],
] as const;

function list<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function normalize(payload: unknown): FinanceData {
  const source = object(payload);
  const permissionSource = object(source.permissions);
  return {
    feeItems: list<FeeItem>(source.feeItems),
    invoices: list<Invoice>(source.invoices),
    payments: list<Payment>(source.payments),
    reversals: list<Reversal>(source.reversals),
    terms: list<Term>(source.terms),
    classes: list<ClassRow>(source.classes),
    students: list<Student>(source.students),
    permissions: {
      canWriteFees: permissionSource.canWriteFees === true,
      canCreateInvoices: permissionSource.canCreateInvoices === true,
      canRecordPayments: permissionSource.canRecordPayments === true,
      canReversePayments: permissionSource.canReversePayments === true,
      canExportFinance: permissionSource.canExportFinance === true,
    },
  };
}
function amount(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return `GHS ${amount(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function shortDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  try { return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(date); } catch { return date.toISOString().slice(0, 10); }
}
function termName(term?: Term | null) { return term ? `${term.academicYear?.name ? `${term.academicYear.name} · ` : ""}${term.name}` : "—"; }
function methodName(value: unknown) { const method = String(value ?? "").trim(); if (!method) return "Other"; return method === "momo" ? "Mobile Money" : method.charAt(0).toUpperCase() + method.slice(1); }

export default function FinanceWorkspaceSafe({ mode = "overview", schoolName = "School" }: { mode?: Mode; schoolName?: string }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [reversalAmount, setReversalAmount] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mvp/finance", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = object(payload);
        throw new Error(String(details.error ?? details.message ?? "Finance data could not be loaded."));
      }
      const next = normalize(payload);
      setData(next);
      if (!silent) {
        const requested = new URLSearchParams(window.location.search).get("invoice");
        if (requested && next.invoices.some((row) => row.id === requested)) {
          setInvoiceId(requested);
          setDrawer({ kind: "payment" });
        }
      }
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Finance data could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const reversalByPayment = useMemo(() => {
    const map = new Map<string, Reversal[]>();
    for (const row of data?.reversals ?? []) map.set(row.paymentId, [...(map.get(row.paymentId) ?? []), row]);
    return map;
  }, [data]);
  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.payments ?? []) map.set(row.invoiceId, (map.get(row.invoiceId) ?? 0) + amount(row.amount));
    for (const reversal of data?.reversals ?? []) {
      const payment = data?.payments.find((row) => row.id === reversal.paymentId);
      if (payment) map.set(payment.invoiceId, Math.max(0, (map.get(payment.invoiceId) ?? 0) - amount(reversal.amount)));
    }
    return map;
  }, [data]);
  const invoices = useMemo<InvoiceRow[]>(() => (data?.invoices ?? []).map((row) => {
    const total = amount(row.totalAmount);
    const paid = Math.min(total, Math.max(0, paidByInvoice.get(row.id) ?? 0));
    const due = Math.max(0, total - paid);
    return { ...row, total, paid, due, statusLabel: due <= 0 ? "Paid" : paid > 0 ? "Part paid" : "Unpaid" };
  }), [data, paidByInvoice]);
  const payments = useMemo<PaymentRow[]>(() => (data?.payments ?? []).map((row) => {
    const gross = amount(row.amount);
    const reversed = (reversalByPayment.get(row.id) ?? []).reduce((sum, reversal) => sum + amount(reversal.amount), 0);
    return { ...row, gross, reversed, net: Math.max(0, gross - reversed) };
  }), [data, reversalByPayment]);

  const search = query.trim().toLowerCase();
  const invoiceRows = invoices.filter((row) => {
    const text = `${row.student?.name ?? ""} ${row.student?.admissionNo ?? ""} ${row.id} ${row.term?.name ?? ""} ${row.student?.class?.name ?? ""}`.toLowerCase();
    return (!search || text.includes(search)) && (!termFilter || row.termId === termFilter) && (!classFilter || row.student?.class?.id === classFilter) && (!statusFilter || row.statusLabel.toLowerCase().replace(" ", "-") === statusFilter);
  });
  const paymentRows = payments.filter((row) => {
    const text = `${row.invoice?.student?.name ?? ""} ${row.invoice?.student?.admissionNo ?? ""} ${row.reference ?? ""} ${row.id} ${row.invoiceId}`.toLowerCase();
    return (!search || text.includes(search)) && (!termFilter || row.invoice?.term?.id === termFilter) && (!classFilter || row.invoice?.student?.class?.id === classFilter) && (!methodFilter || row.method === methodFilter);
  });
  const feeRows = (data?.feeItems ?? []).filter((row) => {
    const text = `${row.name ?? ""} ${row.term?.name ?? ""} ${row.class?.name ?? ""}`.toLowerCase();
    return (!search || text.includes(search)) && (!termFilter || row.termId === termFilter) && (!classFilter || row.classId === classFilter);
  });
  const arrears = invoiceRows.filter((row) => row.due > 0).sort((a, b) => b.due - a.due);
  const reportInvoices = invoices.filter((row) => (!termFilter || row.termId === termFilter) && (!classFilter || row.student?.class?.id === classFilter));
  const reportIds = new Set(reportInvoices.map((row) => row.id));
  const reportPayments = payments.filter((row) => reportIds.has(row.invoiceId));
  const totals = {
    billed: reportInvoices.reduce((sum, row) => sum + row.total, 0),
    collected: reportInvoices.reduce((sum, row) => sum + row.paid, 0),
    owing: reportInvoices.reduce((sum, row) => sum + row.due, 0),
  };
  const collectionRate = totals.billed > 0 ? Math.min(100, Math.round((totals.collected / totals.billed) * 100)) : 0;
  const selectedInvoice = drawer?.kind === "invoiceDetail" ? invoices.find((row) => row.id === drawer.id) ?? null : null;
  const selectedPayment = drawer?.kind === "paymentDetail" ? payments.find((row) => row.id === drawer.id) ?? null : null;

  async function post(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/mvp/finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = object(payload);
        throw new Error(String(details.error ?? details.message ?? "Finance action failed."));
      }
      await load(true);
      setNotice(success);
      setDrawer(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Finance action failed.");
      return false;
    } finally { setBusy(false); }
  }
  const collect = (id: string) => { setInvoiceId(id); setPaymentAmount(""); setPaymentReference(""); setDrawer({ kind: "payment" }); };
  const clearFilters = () => { setQuery(""); setTermFilter(""); setClassFilter(""); setStatusFilter(""); setMethodFilter(""); };

  if (loading) return <div className="fin-shell"><div className="fin-state"><RefreshCw className="fin-spin" size={20} /><strong>Loading finance workspace</strong><span>Reading the school finance ledger…</span></div></div>;
  if (!data) return <div className="fin-shell"><div className="fin-state error"><CircleDollarSign size={24} /><strong>Finance could not be loaded.</strong><span>{error || "Please retry the finance service."}</span><button type="button" onClick={() => void load()}>Try again</button></div></div>;

  const title = mode === "fees" ? "Fee setup" : mode === "invoices" ? "Invoices" : mode === "payments" ? "Payments" : mode === "arrears" ? "Arrears & balances" : mode === "reports" ? "Finance reports" : "Finance overview";
  const primary = mode === "fees" && data.permissions.canWriteFees ? () => setDrawer({ kind: "fee" }) : mode === "invoices" && data.permissions.canCreateInvoices ? () => setDrawer({ kind: "invoice" }) : (mode === "overview" || mode === "payments") && data.permissions.canRecordPayments ? () => setDrawer({ kind: "payment" }) : null;
  const primaryLabel = mode === "fees" ? "Add fee item" : mode === "invoices" ? "Generate invoice" : "Record payment";
  const hasFilters = Boolean(query || termFilter || classFilter || statusFilter || methodFilter);

  return <div className="fin-shell">
    <section className="fin-hero"><div className="fin-hero-copy"><span>{String(schoolName || "School").toUpperCase()} · FINANCE</span><h1>{title}</h1><p>Professional billing, collections, balances, receipts and reporting with details opened only when needed.</p></div><div className="fin-hero-actions"><Link href="/school/fees/evidence" className="fin-secondary"><ReceiptText size={15} /> Evidence centre</Link>{primary ? <button type="button" className="fin-primary" onClick={primary}><Plus size={15} /> {primaryLabel}</button> : null}</div></section>
    <nav className="fin-nav" aria-label="Finance sections">{nav.map(([label, href, key]) => <Link key={href} href={href} className={key === mode ? "active" : ""}>{label}</Link>)}</nav>
    {error ? <div className="fin-alert error"><X size={16} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div> : null}
    {notice ? <div className="fin-alert success"><CheckCircle2 size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div> : null}

    {mode === "overview" ? <>
      <Metrics billed={totals.billed} collected={totals.collected} owing={totals.owing} rate={collectionRate} />
      <section className="fin-overview-grid"><Panel eyebrow="RECENT COLLECTIONS" title="Latest payments"><div className="fin-compact-list">{payments.slice(0, 6).map((row) => <button key={row.id} type="button" onClick={() => setDrawer({ kind: "paymentDetail", id: row.id })}><span><strong>{row.invoice?.student?.name || "Student"}</strong><small>{shortDate(row.createdAt)} · {methodName(row.method)}</small></span><b>{money(row.net)}</b><ChevronRight size={15} /></button>)}{!payments.length ? <Empty text="No payments recorded yet." /> : null}</div><Link className="fin-text-link" href="/school/fees/payments">Open payment ledger <ArrowRight size={14} /></Link></Panel><Panel eyebrow="COLLECTION PRIORITY" title="Largest balances"><div className="fin-compact-list">{invoices.filter((row) => row.due > 0).sort((a, b) => b.due - a.due).slice(0, 6).map((row) => <div className="fin-priority-row" key={row.id}><button type="button" onClick={() => setDrawer({ kind: "invoiceDetail", id: row.id })}><span><strong>{row.student?.name || "Student"}</strong><small>{row.student?.class?.name || "Class"} · {row.term?.name || "Term"}</small></span><b>{money(row.due)}</b></button>{data.permissions.canRecordPayments ? <button className="fin-collect" type="button" onClick={() => collect(row.id)}>Collect</button> : null}</div>)}{!invoices.some((row) => row.due > 0) ? <Empty text="No outstanding balances." /> : null}</div></Panel></section>
    </> : null}

    {mode !== "overview" && mode !== "reports" ? <Filters data={data} query={query} setQuery={setQuery} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} statusFilter={mode === "invoices" ? statusFilter : undefined} setStatusFilter={mode === "invoices" ? setStatusFilter : undefined} methodFilter={mode === "payments" ? methodFilter : undefined} setMethodFilter={mode === "payments" ? setMethodFilter : undefined} clear={hasFilters ? clearFilters : undefined} /> : null}

    {mode === "fees" ? <Panel eyebrow="FEE REGISTER" title="Configured fee items"><Table headers={["Fee item", "Term", "Applies to", "Amount"]}>{feeRows.map((row) => <tr key={row.id}><td><strong>{row.name || "Fee item"}</strong></td><td>{termName(row.term)}</td><td>{row.class?.name || "All classes"}</td><td className="num strong">{money(row.amount)}</td></tr>)}{!feeRows.length ? <EmptyRow cols={4} text="No fee items match these filters." /> : null}</Table></Panel> : null}
    {mode === "invoices" ? <Panel eyebrow="BILLING LEDGER" title="Student invoices"><Table headers={["Student", "Term", "Class", "Billed", "Balance", "Status", ""]}>{invoiceRows.map((row) => <tr key={row.id}><td><strong>{row.student?.name || "Student"}</strong><small>{row.student?.admissionNo || row.id}</small></td><td>{row.term?.name || "—"}</td><td>{row.student?.class?.name || "—"}</td><td className="num">{money(row.total)}</td><td className="num strong">{money(row.due)}</td><td><span className={`fin-status ${row.statusLabel === "Paid" ? "paid" : row.statusLabel === "Part paid" ? "partial" : "unpaid"}`}>{row.statusLabel}</span></td><td className="action"><button className="fin-row-action" type="button" onClick={() => setDrawer({ kind: "invoiceDetail", id: row.id })}>Open <ChevronRight size={14} /></button></td></tr>)}{!invoiceRows.length ? <EmptyRow cols={7} text="No invoices match these filters." /> : null}</Table></Panel> : null}
    {mode === "payments" ? <Panel eyebrow="COLLECTION LEDGER" title="Payments & receipts"><Table headers={["Date", "Student", "Method", "Reference", "Net received", ""]}>{paymentRows.map((row) => <tr key={row.id}><td>{shortDate(row.createdAt)}</td><td><strong>{row.invoice?.student?.name || "Student"}</strong><small>{row.invoice?.student?.admissionNo || row.invoiceId}</small></td><td>{methodName(row.method)}</td><td>{row.reference || "—"}</td><td className="num strong">{money(row.net)}</td><td className="action"><button className="fin-row-action" type="button" onClick={() => setDrawer({ kind: "paymentDetail", id: row.id })}>Receipt <ChevronRight size={14} /></button></td></tr>)}{!paymentRows.length ? <EmptyRow cols={6} text="No payments match these filters." /> : null}</Table></Panel> : null}
    {mode === "arrears" ? <><section className="fin-mini-metrics"><article><span>Outstanding</span><strong>{money(arrears.reduce((sum, row) => sum + row.due, 0))}</strong><small>Filtered balance</small></article><article><span>Accounts owing</span><strong>{arrears.length}</strong><small>Invoices with balances</small></article><article><span>Largest balance</span><strong>{money(arrears[0]?.due)}</strong><small>Highest priority</small></article></section><Panel eyebrow="COLLECTION PRIORITY" title="Outstanding balances"><Table headers={["Student", "Term", "Class", "Billed", "Paid", "Balance", ""]}>{arrears.map((row) => <tr key={row.id}><td><strong>{row.student?.name || "Student"}</strong><small>{row.student?.admissionNo || row.id}</small></td><td>{row.term?.name || "—"}</td><td>{row.student?.class?.name || "—"}</td><td className="num">{money(row.total)}</td><td className="num">{money(row.paid)}</td><td className="num strong danger-text">{money(row.due)}</td><td className="action"><div className="fin-inline-actions"><button className="fin-row-action" type="button" onClick={() => setDrawer({ kind: "invoiceDetail", id: row.id })}>Open</button>{data.permissions.canRecordPayments ? <button className="fin-collect" type="button" onClick={() => collect(row.id)}>Collect</button> : null}</div></td></tr>)}{!arrears.length ? <EmptyRow cols={7} text="No outstanding balances match these filters." /> : null}</Table></Panel></> : null}
    {mode === "reports" ? <Reports data={data} invoices={reportInvoices} payments={reportPayments} totals={totals} rate={collectionRate} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} /> : null}

    {drawer ? <div className="fin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="fin-drawer" role="dialog" aria-modal="true"><button className="fin-close" type="button" onClick={() => setDrawer(null)}><X size={18} /></button>
      {drawer.kind === "fee" ? <form className="fin-form" onSubmit={async (event) => { event.preventDefault(); if (!termId || !feeName.trim() || amount(feeAmount) <= 0) return setError("Choose a term and enter a valid fee name and amount."); if (await post({ action: "feeItem", termId, classId: classId || undefined, name: feeName.trim(), amount: amount(feeAmount) }, "Fee item created.")) { setFeeName(""); setFeeAmount(""); } }}><span className="fin-drawer-kicker">FEE SETUP</span><h2>Add a fee item</h2><label>Academic term<select required value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">Choose term</option>{data.terms.map((row) => <option key={row.id} value={row.id}>{termName(row)}</option>)}</select></label><label>Class scope<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Fee name<input required value={feeName} onChange={(e) => setFeeName(e.target.value)} /></label><label>Amount (GHS)<input required type="number" min="0.01" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} /></label><button className="fin-primary" disabled={busy}>{busy ? "Saving…" : "Create fee item"}</button></form> : null}
      {drawer.kind === "invoice" ? <form className="fin-form" onSubmit={async (event) => { event.preventDefault(); if (!termId || !studentId) return setError("Choose a term and student."); await post({ action: "invoice", termId, studentId }, "Invoice generated."); }}><span className="fin-drawer-kicker">BILLING</span><h2>Generate student invoice</h2><label>Academic term<select required value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">Choose term</option>{data.terms.map((row) => <option key={row.id} value={row.id}>{termName(row)}</option>)}</select></label><label>Student<select required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose student</option>{data.students.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.admissionNo}</option>)}</select></label><button className="fin-primary" disabled={busy}>{busy ? "Generating…" : "Generate invoice"}</button></form> : null}
      {drawer.kind === "payment" ? <form className="fin-form" onSubmit={async (event) => { event.preventDefault(); if (!invoiceId || amount(paymentAmount) <= 0 || !paymentReference.trim()) return setError("Choose an invoice, enter the amount and transaction reference."); await post({ action: "payment", invoiceId, amount: amount(paymentAmount), method: paymentMethod, reference: paymentReference.trim() }, "Payment recorded and receipt is ready."); }}><span className="fin-drawer-kicker">COLLECTION</span><h2>Record payment</h2><label>Outstanding invoice<select required value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">Choose invoice</option>{invoices.filter((row) => row.due > 0).map((row) => <option key={row.id} value={row.id}>{row.student?.name || "Student"} · due {money(row.due)}</option>)}</select></label><label>Amount received (GHS)<input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label><label>Payment method<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank transfer/deposit</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label><label>Receipt / transaction reference<input required value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></label><div className="fin-form-note"><ShieldCheck size={15} /> Duplicate references and overpayments remain server-blocked.</div><button className="fin-primary" disabled={busy}>{busy ? "Recording…" : "Record payment"}</button></form> : null}
      {drawer.kind === "invoiceDetail" && selectedInvoice ? <><span className="fin-drawer-kicker">INVOICE</span><h2>{selectedInvoice.student?.name || "Student invoice"}</h2><p>{selectedInvoice.student?.admissionNo || selectedInvoice.id} · {termName(selectedInvoice.term)}</p><div className="fin-detail-metrics"><div><span>Billed</span><strong>{money(selectedInvoice.total)}</strong></div><div><span>Paid</span><strong>{money(selectedInvoice.paid)}</strong></div><div><span>Balance</span><strong>{money(selectedInvoice.due)}</strong></div></div><div className="fin-detail-section"><h3>Invoice breakdown</h3><div className="fin-detail-list">{list<InvoiceLine>(selectedInvoice.lines).map((line, index) => <div key={`${line.feeItem?.id || "line"}-${index}`}><span>{line.feeItem?.name || "Fee item"}</span><strong>{money(line.amount)}</strong></div>)}</div></div>{selectedInvoice.due > 0 && data.permissions.canRecordPayments ? <button className="fin-primary fin-full" type="button" onClick={() => collect(selectedInvoice.id)}>Collect against this invoice</button> : null}</> : null}
      {drawer.kind === "paymentDetail" && selectedPayment ? <PaymentDetail payment={selectedPayment} reversals={reversalByPayment.get(selectedPayment.id) ?? []} canReverse={data.permissions.canReversePayments} busy={busy} reversalAmount={reversalAmount} setReversalAmount={setReversalAmount} reversalReason={reversalReason} setReversalReason={setReversalReason} reverse={async (event) => { event.preventDefault(); if (amount(reversalAmount) <= 0 || !reversalReason.trim()) return setError("Enter a valid reversal amount and reason."); await post({ action: "reversal", paymentId: selectedPayment.id, amount: amount(reversalAmount), reason: reversalReason.trim(), idempotencyKey: `ui-${selectedPayment.id}-${Date.now()}` }, "Payment reversal recorded."); }} /> : null}
    </aside></div> : null}
  </div>;
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <section className="fin-card"><div className="fin-card-head"><div><span>{eyebrow}</span><h2>{title}</h2></div></div>{children}</section>; }
function Empty({ text }: { text: string }) { return <div className="fin-empty">{text}</div>; }
function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols}><Empty text={text} /></td></tr>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="fin-table-wrap"><table className="fin-table"><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className={header === "Amount" || header === "Billed" || header === "Paid" || header === "Balance" || header === "Net received" ? "num" : ""}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Metrics({ billed, collected, owing, rate }: { billed: number; collected: number; owing: number; rate: number }) { return <section className="fin-metrics"><article><span className="fin-metric-icon"><FileText size={18} /></span><div><small>Total billed</small><strong>{money(billed)}</strong><p>Student invoices</p></div></article><article><span className="fin-metric-icon"><WalletCards size={18} /></span><div><small>Collected</small><strong>{money(collected)}</strong><p>{rate}% collection rate</p></div></article><article><span className="fin-metric-icon"><CircleDollarSign size={18} /></span><div><small>Outstanding</small><strong>{money(owing)}</strong><p>Open balances</p></div></article><article><span className="fin-metric-icon"><BarChart3 size={18} /></span><div><small>Collection health</small><strong>{rate}%</strong><progress max={100} value={rate} /></div></article></section>; }
function Filters({ data, query, setQuery, termFilter, setTermFilter, classFilter, setClassFilter, statusFilter, setStatusFilter, methodFilter, setMethodFilter, clear }: { data: FinanceData; query: string; setQuery: (v: string) => void; termFilter: string; setTermFilter: (v: string) => void; classFilter: string; setClassFilter: (v: string) => void; statusFilter?: string; setStatusFilter?: (v: string) => void; methodFilter?: string; setMethodFilter?: (v: string) => void; clear?: () => void }) { return <section className="fin-filters"><label className="fin-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, admission no., reference…" /></label><div className="fin-filter-selects"><span><Filter size={14} /> Filters</span><select value={termFilter} onChange={(e) => setTermFilter(e.target.value)}><option value="">All terms</option>{data.terms.map((row) => <option key={row.id} value={row.id}>{termName(row)}</option>)}</select><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{setStatusFilter ? <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="part-paid">Part paid</option><option value="paid">Paid</option></select> : null}{setMethodFilter ? <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}><option value="">All methods</option><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank</option><option value="card">Card</option><option value="cheque">Cheque</option></select> : null}{clear ? <button type="button" onClick={clear}>Clear</button> : null}</div></section>; }
function PaymentDetail({ payment, reversals, canReverse, busy, reversalAmount, setReversalAmount, reversalReason, setReversalReason, reverse }: { payment: PaymentRow; reversals: Reversal[]; canReverse: boolean; busy: boolean; reversalAmount: string; setReversalAmount: (v: string) => void; reversalReason: string; setReversalReason: (v: string) => void; reverse: (event: FormEvent) => void }) { const remaining = Math.max(0, payment.gross - payment.reversed); return <><span className="fin-drawer-kicker">PAYMENT RECEIPT</span><h2>{payment.invoice?.student?.name || "Payment"}</h2><p>{shortDate(payment.createdAt)} · {methodName(payment.method)} · {payment.reference || "No reference"}</p><div className="fin-detail-metrics"><div><span>Original</span><strong>{money(payment.gross)}</strong></div><div><span>Reversed</span><strong>{money(payment.reversed)}</strong></div><div><span>Net receipt</span><strong>{money(payment.net)}</strong></div></div><Link className="fin-primary fin-full" href={`/school/fees/receipt/${payment.id}`} target="_blank"><ReceiptText size={15} /> Open official receipt</Link>{reversals.length ? <div className="fin-detail-section"><h3>Reversal history</h3><div className="fin-detail-list">{reversals.map((row) => <div key={row.id}><span>{shortDate(row.createdAt)}<small>{row.reason || "Reversal"}</small></span><strong>-{money(row.amount)}</strong></div>)}</div></div> : null}{canReverse && remaining > 0 ? <details className="fin-reversal"><summary>Reverse all or part of this payment</summary><form className="fin-form compact" onSubmit={reverse}><label>Amount to reverse<input required type="number" min="0.01" max={remaining} step="0.01" value={reversalAmount} onChange={(e) => setReversalAmount(e.target.value)} /></label><label>Reason<textarea required value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} /></label><button className="fin-danger" disabled={busy}>{busy ? "Saving…" : "Record reversal"}</button></form></details> : null}</>; }
function Reports({ data, invoices, payments, totals, rate, termFilter, setTermFilter, classFilter, setClassFilter }: { data: FinanceData; invoices: InvoiceRow[]; payments: PaymentRow[]; totals: { billed: number; collected: number; owing: number }; rate: number; termFilter: string; setTermFilter: (v: string) => void; classFilter: string; setClassFilter: (v: string) => void }) { const methods = ["cash", "momo", "bank", "card", "cheque"].map((method) => ({ method, rows: payments.filter((row) => row.method === method) })).filter((item) => item.rows.length); const top = [...invoices].filter((row) => row.due > 0).sort((a, b) => b.due - a.due).slice(0, 8); return <><section className="fin-report-filter"><div><Filter size={15} /><strong>Report scope</strong><span>Filters recalculate all figures.</span></div><select value={termFilter} onChange={(e) => setTermFilter(e.target.value)}><option value="">All terms</option>{data.terms.map((row) => <option key={row.id} value={row.id}>{termName(row)}</option>)}</select><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></section><Metrics billed={totals.billed} collected={totals.collected} owing={totals.owing} rate={rate} /><section className="fin-overview-grid"><Panel eyebrow="PAYMENT MIX" title="Collections by method"><div className="fin-method-list">{methods.map((item) => <div key={item.method}><span><strong>{methodName(item.method)}</strong><small>{item.rows.length} transactions</small></span><b>{money(item.rows.reduce((sum, row) => sum + row.net, 0))}</b></div>)}{!methods.length ? <Empty text="No payments in this scope." /> : null}</div></Panel><Panel eyebrow="EXPOSURE" title="Largest outstanding accounts"><div className="fin-method-list">{top.map((row) => <div key={row.id}><span><strong>{row.student?.name || "Student"}</strong><small>{row.student?.class?.name || "Class"} · {row.term?.name || "Term"}</small></span><b>{money(row.due)}</b></div>)}{!top.length ? <Empty text="No outstanding balances." /> : null}</div></Panel></section><Panel eyebrow="CONTROLLED EXPORTS" title="Download finance datasets"><div className="fin-export-grid">{data.permissions.canExportFinance ? <><a href="/api/school/exports/fees"><FileText size={18} /><span><strong>Fees & invoices</strong><small>CSV ledger</small></span><ArrowRight size={15} /></a><a href="/api/school/exports/payments"><ReceiptText size={18} /><span><strong>Payments</strong><small>Collection extract</small></span><ArrowRight size={15} /></a><a href="/api/school/exports/arrears"><CircleDollarSign size={18} /><span><strong>Arrears</strong><small>Outstanding balances</small></span><ArrowRight size={15} /></a></> : <Empty text="Bulk finance export permission is required." />}</div></Panel></>; }
