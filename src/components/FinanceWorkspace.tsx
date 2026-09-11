"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
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
  UsersRound,
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
type Invoice = {
  id: string;
  studentId: string;
  termId: string;
  totalAmount: number | string;
  status: string;
  createdAt: string;
  student?: Student | null;
  term?: Term | null;
  lines?: InvoiceLine[];
};
type PaymentInvoice = {
  id: string;
  totalAmount: number | string;
  status: string;
  student?: Student | null;
  term?: Term | null;
};
type Payment = {
  id: string;
  invoiceId: string;
  amount: number | string;
  method: string;
  reference?: string | null;
  createdAt: string;
  invoice?: PaymentInvoice | null;
};
type Reversal = { id: string; paymentId: string; amount: number | string; reason: string; reversedBy: string; createdAt: string };
type FinancePermissions = {
  canWriteFees: boolean;
  canCreateInvoices: boolean;
  canRecordPayments: boolean;
  canReversePayments: boolean;
  canExportFinance: boolean;
};
type FinanceData = {
  feeItems: FeeItem[];
  invoices: Invoice[];
  payments: Payment[];
  reversals: Reversal[];
  terms: Term[];
  classes: ClassRow[];
  students: Student[];
  permissions: FinancePermissions;
};
type Drawer =
  | { kind: "fee" }
  | { kind: "invoice" }
  | { kind: "payment" }
  | { kind: "invoiceDetail"; id: string }
  | { kind: "paymentDetail"; id: string }
  | null;

type InvoiceRow = Invoice & { total: number; paid: number; due: number; statusLabel: "Paid" | "Part paid" | "Unpaid" };
type PaymentRow = Payment & { gross: number; reversed: number; net: number };

const nav: Array<{ mode: Mode | "payroll"; href: string; label: string }> = [
  { mode: "overview", href: "/school/fees/overview", label: "Overview" },
  { mode: "fees", href: "/school/fees/fees", label: "Fee setup" },
  { mode: "invoices", href: "/school/fees/invoices", label: "Invoices" },
  { mode: "payments", href: "/school/fees/payments", label: "Payments" },
  { mode: "arrears", href: "/school/fees/arrears", label: "Arrears" },
  { mode: "reports", href: "/school/fees/reports", label: "Reports" },
  { mode: "payroll", href: "/school/fees/payroll", label: "Payroll" },
];

const money = (value: number | string) => `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (value: string) => new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const toPesewas = (value: unknown) => Math.round(Number(value || 0) * 100);
const fromPesewas = (value: number) => value / 100;
const termName = (term?: Term | null) => term ? `${term.academicYear?.name ? `${term.academicYear.name} · ` : ""}${term.name}` : "—";
const methodName = (method: string) => method === "momo" ? "Mobile Money" : method.charAt(0).toUpperCase() + method.slice(1);

export default function FinanceWorkspace({ mode = "overview", schoolName = "School" }: { mode?: Mode; schoolName?: string }) {
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
  const [limit, setLimit] = useState(30);

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "momo" | "card" | "bank" | "cheque">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [reversalAmount, setReversalAmount] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mvp/finance", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? payload?.message ?? "Finance data could not be loaded.");
      setData(payload as FinanceData);
      if (!silent) {
        const requestedInvoice = new URLSearchParams(window.location.search).get("invoice");
        if (requestedInvoice && (payload.invoices as Invoice[]).some((row) => row.id === requestedInvoice)) {
          setInvoiceId(requestedInvoice);
          setDrawer({ kind: "payment" });
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Finance data could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setLimit(30); }, [mode, query, termFilter, classFilter, statusFilter, methodFilter]);

  const reversalsByPayment = useMemo(() => {
    const map = new Map<string, Reversal[]>();
    for (const reversal of data?.reversals ?? []) map.set(reversal.paymentId, [...(map.get(reversal.paymentId) ?? []), reversal]);
    return map;
  }, [data]);

  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of data?.payments ?? []) map.set(payment.invoiceId, (map.get(payment.invoiceId) ?? 0) + toPesewas(payment.amount));
    for (const reversal of data?.reversals ?? []) {
      const payment = data?.payments.find((row) => row.id === reversal.paymentId);
      if (payment) map.set(payment.invoiceId, (map.get(payment.invoiceId) ?? 0) - toPesewas(reversal.amount));
    }
    return map;
  }, [data]);

  const invoiceRows = useMemo<InvoiceRow[]>(() => (data?.invoices ?? []).map((invoice) => {
    const total = toPesewas(invoice.totalAmount);
    const paid = Math.max(0, paidByInvoice.get(invoice.id) ?? 0);
    const due = Math.max(0, total - paid);
    return {
      ...invoice,
      total: fromPesewas(total),
      paid: fromPesewas(paid),
      due: fromPesewas(due),
      statusLabel: due === 0 ? "Paid" : paid > 0 ? "Part paid" : "Unpaid",
    };
  }), [data, paidByInvoice]);

  const paymentRows = useMemo<PaymentRow[]>(() => (data?.payments ?? []).map((payment) => {
    const gross = toPesewas(payment.amount);
    const reversed = (reversalsByPayment.get(payment.id) ?? []).reduce((sum, row) => sum + toPesewas(row.amount), 0);
    return { ...payment, gross: fromPesewas(gross), reversed: fromPesewas(reversed), net: fromPesewas(Math.max(0, gross - reversed)) };
  }), [data, reversalsByPayment]);

  const textMatches = (parts: Array<string | null | undefined>) => !query.trim() || parts.join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const filteredInvoices = useMemo(() => invoiceRows.filter((row) => {
    if (!textMatches([row.student?.name, row.student?.admissionNo, row.id, row.term?.name, row.student?.class?.name])) return false;
    if (termFilter && row.termId !== termFilter) return false;
    if (classFilter && row.student?.class?.id !== classFilter) return false;
    if (statusFilter && row.statusLabel.toLowerCase().replace(" ", "-") !== statusFilter) return false;
    return true;
  }), [invoiceRows, query, termFilter, classFilter, statusFilter]);

  const filteredPayments = useMemo(() => paymentRows.filter((row) => {
    if (!textMatches([row.invoice?.student?.name, row.invoice?.student?.admissionNo, row.reference, row.id, row.invoiceId])) return false;
    if (termFilter && row.invoice?.term?.id !== termFilter) return false;
    if (classFilter && row.invoice?.student?.class?.id !== classFilter) return false;
    if (methodFilter && row.method !== methodFilter) return false;
    return true;
  }), [paymentRows, query, termFilter, classFilter, methodFilter]);

  const filteredFees = useMemo(() => (data?.feeItems ?? []).filter((row) => {
    if (!textMatches([row.name, row.term?.name, row.class?.name])) return false;
    if (termFilter && row.termId !== termFilter) return false;
    if (classFilter && row.classId !== classFilter) return false;
    return true;
  }), [data, query, termFilter, classFilter]);

  const arrears = useMemo(() => filteredInvoices.filter((row) => row.due > 0).sort((a, b) => b.due - a.due), [filteredInvoices]);
  const reportInvoices = useMemo(() => invoiceRows.filter((row) => (!termFilter || row.termId === termFilter) && (!classFilter || row.student?.class?.id === classFilter)), [invoiceRows, termFilter, classFilter]);
  const reportInvoiceIds = useMemo(() => new Set(reportInvoices.map((row) => row.id)), [reportInvoices]);
  const reportPayments = useMemo(() => paymentRows.filter((row) => reportInvoiceIds.has(row.invoiceId)), [paymentRows, reportInvoiceIds]);

  const totals = useMemo(() => ({
    billed: reportInvoices.reduce((sum, row) => sum + row.total, 0),
    collected: reportInvoices.reduce((sum, row) => sum + row.paid, 0),
    owing: reportInvoices.reduce((sum, row) => sum + row.due, 0),
    debtors: reportInvoices.filter((row) => row.due > 0).length,
  }), [reportInvoices]);
  const collectionRate = totals.billed ? Math.min(100, Math.round((totals.collected / totals.billed) * 100)) : 0;

  const selectedInvoice = drawer?.kind === "invoiceDetail" ? invoiceRows.find((row) => row.id === drawer.id) ?? null : null;
  const selectedPayment = drawer?.kind === "paymentDetail" ? paymentRows.find((row) => row.id === drawer.id) ?? null : null;
  const selectedInvoicePayments = selectedInvoice ? paymentRows.filter((row) => row.invoiceId === selectedInvoice.id) : [];

  async function post(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/mvp/finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? payload?.message ?? "The finance action could not be completed.");
      await load(true);
      setNotice(success);
      setDrawer(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The finance action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const createFee = async (event: FormEvent) => {
    event.preventDefault();
    if (!termId || !feeName.trim() || !feeAmount) return setError("Choose a term and enter the fee name and amount.");
    if (await post({ action: "feeItem", termId, classId: classId || undefined, name: feeName.trim(), amount: Number(feeAmount) }, "Fee item created successfully.")) {
      setFeeName(""); setFeeAmount(""); setClassId("");
    }
  };
  const createInvoice = async (event: FormEvent) => {
    event.preventDefault();
    if (!termId || !studentId) return setError("Choose the academic term and student.");
    if (await post({ action: "invoice", termId, studentId }, "Student invoice generated successfully.")) setStudentId("");
  };
  const recordPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!invoiceId || !paymentAmount || !paymentReference.trim()) return setError("Choose an invoice, enter the amount received, and provide a receipt/reference number.");
    if (await post({ action: "payment", invoiceId, amount: Number(paymentAmount), method: paymentMethod, reference: paymentReference.trim() }, "Payment recorded and receipt is ready.")) {
      setPaymentAmount(""); setPaymentReference("");
    }
  };
  const reverseSelectedPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPayment || !reversalAmount || !reversalReason.trim()) return setError("Enter the reversal amount and reason.");
    if (await post({ action: "reversal", paymentId: selectedPayment.id, amount: Number(reversalAmount), reason: reversalReason.trim(), idempotencyKey: `ui-${selectedPayment.id}-${Date.now()}` }, "Payment reversal recorded in the audit trail.")) {
      setReversalAmount(""); setReversalReason("");
    }
  };

  const openPaymentForInvoice = (id: string) => { setInvoiceId(id); setPaymentAmount(""); setPaymentReference(""); setDrawer({ kind: "payment" }); };
  const resetFilters = () => { setQuery(""); setTermFilter(""); setClassFilter(""); setStatusFilter(""); setMethodFilter(""); };
  const hasFilters = Boolean(query || termFilter || classFilter || statusFilter || methodFilter);

  if (loading) return <div className="fin-shell"><div className="fin-state"><RefreshCw className="fin-spin" size={20} /><strong>Loading finance workspace</strong><span>Reading invoices, payments, balances and permissions…</span></div></div>;
  if (!data) return <div className="fin-shell"><div className="fin-state error"><CircleDollarSign size={24} /><strong>Finance could not be opened.</strong><span>{error || "The finance service did not return data."}</span><button type="button" onClick={() => void load()}>Try again</button></div></div>;

  const primaryAction = mode === "fees" && data.permissions.canWriteFees ? () => setDrawer({ kind: "fee" })
    : mode === "invoices" && data.permissions.canCreateInvoices ? () => setDrawer({ kind: "invoice" })
      : (mode === "payments" || mode === "overview") && data.permissions.canRecordPayments ? () => setDrawer({ kind: "payment" })
        : null;
  const primaryLabel = mode === "fees" ? "Add fee item" : mode === "invoices" ? "Generate invoice" : "Record payment";
  const pageTitle = mode === "fees" ? "Fee setup" : mode === "invoices" ? "Invoices" : mode === "payments" ? "Payments" : mode === "arrears" ? "Arrears & balances" : mode === "reports" ? "Finance reports" : "Finance overview";
  const pageDescription = mode === "fees" ? "Define school charges by term and class without mixing billing operations into the same screen."
    : mode === "invoices" ? "Create student bills, monitor balances, and open an invoice only when you need its full breakdown."
      : mode === "payments" ? "Record collections, verify references, open receipts, and keep reversals visible in the audit trail."
        : mode === "arrears" ? "Prioritise outstanding accounts with clear filters and collect directly against the correct invoice."
          : mode === "reports" ? "Review filtered finance performance and export controlled datasets for reconciliation."
            : "A concise control centre for billing, collections, outstanding balances and finance performance.";

  return <div className="fin-shell">
    <section className="fin-hero">
      <div className="fin-hero-copy"><span>{schoolName.toUpperCase()} · FINANCE</span><h1>{pageTitle}</h1><p>{pageDescription}</p></div>
      <div className="fin-hero-actions">
        <Link href="/school/fees/evidence" className="fin-secondary"><ReceiptText size={15} /> Evidence centre</Link>
        {primaryAction ? <button type="button" className="fin-primary" onClick={primaryAction}><Plus size={15} />{primaryLabel}</button> : null}
      </div>
    </section>

    <nav className="fin-nav" aria-label="Finance sections">{nav.map((item) => <Link key={item.mode} href={item.href} className={item.mode === mode ? "active" : ""}>{item.label}</Link>)}</nav>

    {error ? <div className="fin-alert error"><X size={16} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div> : null}
    {notice ? <div className="fin-alert success"><CheckCircle2 size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14} /></button></div> : null}

    {mode === "overview" ? <Overview
      totals={totals}
      collectionRate={collectionRate}
      payments={paymentRows.slice(0, 5)}
      arrears={[...invoiceRows].filter((row) => row.due > 0).sort((a, b) => b.due - a.due).slice(0, 5)}
      onPayment={(id) => setDrawer({ kind: "paymentDetail", id })}
      onInvoice={(id) => setDrawer({ kind: "invoiceDetail", id })}
      onCollect={openPaymentForInvoice}
    /> : null}

    {mode === "fees" ? <>
      <FilterBar data={data} query={query} setQuery={setQuery} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} hasFilters={hasFilters} reset={resetFilters} />
      <section className="fin-card"><Header eyebrow="FEE REGISTER" title="Configured fee items" subtitle={`${filteredFees.length} item${filteredFees.length === 1 ? "" : "s"} match this view.`} />
        <div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Fee item</th><th>Term</th><th>Applies to</th><th className="num">Amount</th></tr></thead><tbody>{filteredFees.slice(0, limit).map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{termName(item.term)}</td><td>{item.class?.name ?? "All classes"}</td><td className="num strong">{money(item.amount)}</td></tr>)}{!filteredFees.length ? <EmptyRow cols={4} text="No fee items match these filters." /> : null}</tbody></table></div>
        <ShowMore count={filteredFees.length} limit={limit} setLimit={setLimit} />
      </section>
    </> : null}

    {mode === "invoices" ? <>
      <FilterBar data={data} query={query} setQuery={setQuery} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} hasFilters={hasFilters} reset={resetFilters} />
      <section className="fin-card"><Header eyebrow="BILLING LEDGER" title="Student invoices" subtitle={`${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? "" : "s"} match this view.`} />
        <div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Student</th><th>Term</th><th>Class</th><th className="num">Billed</th><th className="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>{filteredInvoices.slice(0, limit).map((row) => <tr key={row.id}><td><strong>{row.student?.name ?? "Student"}</strong><small>{row.student?.admissionNo ?? row.id.slice(0, 8)}</small></td><td>{row.term?.name ?? "—"}</td><td>{row.student?.class?.name ?? "—"}</td><td className="num">{money(row.total)}</td><td className={`num strong ${row.due > 0 ? "danger-text" : "success-text"}`}>{money(row.due)}</td><td><Status value={row.statusLabel} /></td><td className="action"><button type="button" className="fin-row-action" onClick={() => setDrawer({ kind: "invoiceDetail", id: row.id })}>Open <ChevronRight size={14} /></button></td></tr>)}{!filteredInvoices.length ? <EmptyRow cols={7} text="No invoices match these filters." /> : null}</tbody></table></div>
        <ShowMore count={filteredInvoices.length} limit={limit} setLimit={setLimit} />
      </section>
    </> : null}

    {mode === "payments" ? <>
      <FilterBar data={data} query={query} setQuery={setQuery} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} methodFilter={methodFilter} setMethodFilter={setMethodFilter} hasFilters={hasFilters} reset={resetFilters} />
      <section className="fin-card"><Header eyebrow="COLLECTION LEDGER" title="Payments & receipts" subtitle={`${filteredPayments.length} transaction${filteredPayments.length === 1 ? "" : "s"} match this view.`} />
        <div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Reference</th><th className="num">Net received</th><th></th></tr></thead><tbody>{filteredPayments.slice(0, limit).map((row) => <tr key={row.id}><td>{shortDate(row.createdAt)}</td><td><strong>{row.invoice?.student?.name ?? "Student"}</strong><small>{row.invoice?.student?.admissionNo ?? row.invoiceId.slice(0, 8)}</small></td><td>{methodName(row.method)}</td><td>{row.reference || "—"}</td><td className="num strong">{money(row.net)}</td><td className="action"><button type="button" className="fin-row-action" onClick={() => setDrawer({ kind: "paymentDetail", id: row.id })}>Receipt <ChevronRight size={14} /></button></td></tr>)}{!filteredPayments.length ? <EmptyRow cols={6} text="No payments match these filters." /> : null}</tbody></table></div>
        <ShowMore count={filteredPayments.length} limit={limit} setLimit={setLimit} />
      </section>
    </> : null}

    {mode === "arrears" ? <>
      <FilterBar data={data} query={query} setQuery={setQuery} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} hasFilters={hasFilters} reset={resetFilters} />
      <section className="fin-mini-metrics"><article><span>Outstanding</span><strong>{money(arrears.reduce((sum, row) => sum + row.due, 0))}</strong><small>Across this filtered view</small></article><article><span>Accounts owing</span><strong>{arrears.length}</strong><small>Invoices with balances</small></article><article><span>Largest balance</span><strong>{money(arrears[0]?.due ?? 0)}</strong><small>Highest collection priority</small></article></section>
      <section className="fin-card"><Header eyebrow="COLLECTION PRIORITY" title="Outstanding balances" subtitle="Open the account for detail or collect directly against the correct invoice." />
        <div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Student</th><th>Term</th><th>Class</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Balance</th><th></th></tr></thead><tbody>{arrears.slice(0, limit).map((row) => <tr key={row.id}><td><strong>{row.student?.name ?? "Student"}</strong><small>{row.student?.admissionNo ?? row.id.slice(0, 8)}</small></td><td>{row.term?.name ?? "—"}</td><td>{row.student?.class?.name ?? "—"}</td><td className="num">{money(row.total)}</td><td className="num">{money(row.paid)}</td><td className="num strong danger-text">{money(row.due)}</td><td className="action"><div className="fin-inline-actions"><button type="button" className="fin-row-action" onClick={() => setDrawer({ kind: "invoiceDetail", id: row.id })}>Open</button>{data.permissions.canRecordPayments ? <button type="button" className="fin-collect" onClick={() => openPaymentForInvoice(row.id)}>Collect</button> : null}</div></td></tr>)}{!arrears.length ? <EmptyRow cols={7} text="No outstanding balances match this view." /> : null}</tbody></table></div>
        <ShowMore count={arrears.length} limit={limit} setLimit={setLimit} />
      </section>
    </> : null}

    {mode === "reports" ? <Reports data={data} termFilter={termFilter} setTermFilter={setTermFilter} classFilter={classFilter} setClassFilter={setClassFilter} totals={totals} collectionRate={collectionRate} payments={reportPayments} invoices={reportInvoices} /> : null}

    {drawer ? <div className="fin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
      <aside className="fin-drawer" role="dialog" aria-modal="true" aria-label="Finance details">
        <button type="button" className="fin-close" onClick={() => setDrawer(null)} aria-label="Close"><X size={18} /></button>
        {drawer.kind === "fee" ? <FeeForm data={data} termId={termId} setTermId={setTermId} classId={classId} setClassId={setClassId} feeName={feeName} setFeeName={setFeeName} feeAmount={feeAmount} setFeeAmount={setFeeAmount} busy={busy} submit={createFee} /> : null}
        {drawer.kind === "invoice" ? <InvoiceForm data={data} termId={termId} setTermId={setTermId} studentId={studentId} setStudentId={setStudentId} busy={busy} submit={createInvoice} /> : null}
        {drawer.kind === "payment" ? <PaymentForm invoices={invoiceRows.filter((row) => row.due > 0)} invoiceId={invoiceId} setInvoiceId={setInvoiceId} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} paymentReference={paymentReference} setPaymentReference={setPaymentReference} busy={busy} submit={recordPayment} /> : null}
        {drawer.kind === "invoiceDetail" && selectedInvoice ? <InvoiceDetail invoice={selectedInvoice} payments={selectedInvoicePayments} canCollect={data.permissions.canRecordPayments} onCollect={() => openPaymentForInvoice(selectedInvoice.id)} onPayment={(id) => setDrawer({ kind: "paymentDetail", id })} /> : null}
        {drawer.kind === "paymentDetail" && selectedPayment ? <PaymentDetail payment={selectedPayment} reversals={reversalsByPayment.get(selectedPayment.id) ?? []} canReverse={data.permissions.canReversePayments} reversalAmount={reversalAmount} setReversalAmount={setReversalAmount} reversalReason={reversalReason} setReversalReason={setReversalReason} busy={busy} submitReverse={reverseSelectedPayment} /> : null}
      </aside>
    </div> : null}
  </div>;
}

function Header({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return <div className="fin-card-head"><div><span>{eyebrow}</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>;
}

function Overview({ totals, collectionRate, payments, arrears, onPayment, onInvoice, onCollect }: { totals: { billed: number; collected: number; owing: number; debtors: number }; collectionRate: number; payments: PaymentRow[]; arrears: InvoiceRow[]; onPayment: (id: string) => void; onInvoice: (id: string) => void; onCollect: (id: string) => void }) {
  return <>
    <section className="fin-metrics">
      <article><span className="fin-metric-icon"><FileText size={18} /></span><div><small>Total billed</small><strong>{money(totals.billed)}</strong><p>Student invoices</p></div></article>
      <article><span className="fin-metric-icon"><WalletCards size={18} /></span><div><small>Collected</small><strong>{money(totals.collected)}</strong><p>{collectionRate}% collection rate</p></div></article>
      <article><span className="fin-metric-icon"><CircleDollarSign size={18} /></span><div><small>Outstanding</small><strong>{money(totals.owing)}</strong><p>{totals.debtors} account{totals.debtors === 1 ? "" : "s"} owing</p></div></article>
      <article><span className="fin-metric-icon"><BarChart3 size={18} /></span><div><small>Collection health</small><strong>{collectionRate}%</strong><progress max={100} value={collectionRate} aria-label="Collection rate" /></div></article>
    </section>
    <section className="fin-overview-grid">
      <div className="fin-card"><Header eyebrow="RECENT COLLECTIONS" title="Latest payments" subtitle="Open a transaction only when you need receipt detail." /><div className="fin-compact-list">{payments.map((row) => <button type="button" key={row.id} onClick={() => onPayment(row.id)}><span><strong>{row.invoice?.student?.name ?? "Student"}</strong><small>{shortDate(row.createdAt)} · {methodName(row.method)}</small></span><b>{money(row.net)}</b><ChevronRight size={15} /></button>)}{!payments.length ? <div className="fin-empty">No payments recorded yet.</div> : null}</div><Link className="fin-text-link" href="/school/fees/payments">Open payment ledger <ArrowRight size={14} /></Link></div>
      <div className="fin-card"><Header eyebrow="COLLECTION PRIORITY" title="Largest balances" subtitle="A short priority list—not the full arrears register." /><div className="fin-compact-list">{arrears.map((row) => <div className="fin-priority-row" key={row.id}><button type="button" onClick={() => onInvoice(row.id)}><span><strong>{row.student?.name ?? "Student"}</strong><small>{row.student?.class?.name ?? "Class"} · {row.term?.name ?? "Term"}</small></span><b>{money(row.due)}</b></button><button type="button" className="fin-collect" onClick={() => onCollect(row.id)}>Collect</button></div>)}{!arrears.length ? <div className="fin-empty">No outstanding balances.</div> : null}</div><Link className="fin-text-link" href="/school/fees/arrears">Open arrears register <ArrowRight size={14} /></Link></div>
    </section>
    <section className="fin-quick-grid">
      <Link href="/school/fees/fees"><Banknote size={18} /><span><strong>Fee setup</strong><small>Define term and class charges</small></span><ChevronRight size={16} /></Link>
      <Link href="/school/fees/invoices"><FileText size={18} /><span><strong>Invoices</strong><small>Generate and inspect student bills</small></span><ChevronRight size={16} /></Link>
      <Link href="/school/fees/reports"><BarChart3 size={18} /><span><strong>Reports</strong><small>Review performance and exports</small></span><ChevronRight size={16} /></Link>
      <Link href="/school/fees/payroll"><UsersRound size={18} /><span><strong>Payroll</strong><small>Salary structures and pay runs</small></span><ChevronRight size={16} /></Link>
    </section>
  </>;
}

function FilterBar({ data, query, setQuery, termFilter, setTermFilter, classFilter, setClassFilter, statusFilter, setStatusFilter, methodFilter, setMethodFilter, hasFilters, reset }: { data: FinanceData; query: string; setQuery: (value: string) => void; termFilter: string; setTermFilter: (value: string) => void; classFilter: string; setClassFilter: (value: string) => void; statusFilter?: string; setStatusFilter?: (value: string) => void; methodFilter?: string; setMethodFilter?: (value: string) => void; hasFilters: boolean; reset: () => void }) {
  return <section className="fin-filters"><label className="fin-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, admission no., reference…" /></label><div className="fin-filter-selects"><span><Filter size={14} /> Filters</span><select value={termFilter} onChange={(event) => setTermFilter(event.target.value)} aria-label="Filter by term"><option value="">All terms</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{termName(term)}</option>)}</select><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Filter by class"><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{setStatusFilter ? <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="part-paid">Part paid</option><option value="paid">Paid</option></select> : null}{setMethodFilter ? <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} aria-label="Filter by payment method"><option value="">All methods</option><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank</option><option value="card">Card</option><option value="cheque">Cheque</option></select> : null}{hasFilters ? <button type="button" onClick={reset}>Clear</button> : null}</div></section>;
}

function Status({ value }: { value: InvoiceRow["statusLabel"] }) {
  return <span className={`fin-status ${value === "Paid" ? "paid" : value === "Part paid" ? "partial" : "unpaid"}`}>{value}</span>;
}

function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols}><div className="fin-empty">{text}</div></td></tr>; }
function ShowMore({ count, limit, setLimit }: { count: number; limit: number; setLimit: (value: number) => void }) { return count > limit ? <div className="fin-show-more"><span>Showing {Math.min(limit, count)} of {count}</span><button type="button" onClick={() => setLimit(Math.min(count, limit + 30))}>Show more</button></div> : null; }

function FeeForm({ data, termId, setTermId, classId, setClassId, feeName, setFeeName, feeAmount, setFeeAmount, busy, submit }: { data: FinanceData; termId: string; setTermId: (v: string) => void; classId: string; setClassId: (v: string) => void; feeName: string; setFeeName: (v: string) => void; feeAmount: string; setFeeAmount: (v: string) => void; busy: boolean; submit: (e: FormEvent) => void }) {
  return <><span className="fin-drawer-kicker">FEE SETUP</span><h2>Add a fee item</h2><p>Create one school-wide or class-specific charge for a term.</p><form className="fin-form" onSubmit={submit}><label>Academic term<select required value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">Choose term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{termName(term)}</option>)}</select></label><label>Class scope<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Fee name<input required value={feeName} onChange={(event) => setFeeName(event.target.value)} placeholder="e.g. Tuition, Feeding, Transport" /></label><label>Amount (GHS)<input required type="number" min="0.01" step="0.01" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} /></label><button className="fin-primary" disabled={busy}>{busy ? "Saving…" : "Create fee item"}</button></form></>;
}

function InvoiceForm({ data, termId, setTermId, studentId, setStudentId, busy, submit }: { data: FinanceData; termId: string; setTermId: (v: string) => void; studentId: string; setStudentId: (v: string) => void; busy: boolean; submit: (e: FormEvent) => void }) {
  const students = termId ? data.students.filter((student) => !data.invoices.some((invoice) => invoice.studentId === student.id && invoice.termId === termId)) : data.students;
  return <><span className="fin-drawer-kicker">BILLING</span><h2>Generate student invoice</h2><p>SukuuNova applies the fee items configured for the selected term and the learner&apos;s class.</p><form className="fin-form" onSubmit={submit}><label>Academic term<select required value={termId} onChange={(event) => { setTermId(event.target.value); setStudentId(""); }}><option value="">Choose term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{termName(term)}</option>)}</select></label><label>Student<select required value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Choose student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}{student.class?.name ? ` · ${student.class.name}` : ""}</option>)}</select></label>{termId && !students.length ? <div className="fin-form-note">All active students already have an invoice for this term.</div> : null}<button className="fin-primary" disabled={busy || !students.length}>{busy ? "Generating…" : "Generate invoice"}</button></form></>;
}

function PaymentForm({ invoices, invoiceId, setInvoiceId, paymentAmount, setPaymentAmount, paymentMethod, setPaymentMethod, paymentReference, setPaymentReference, busy, submit }: { invoices: InvoiceRow[]; invoiceId: string; setInvoiceId: (v: string) => void; paymentAmount: string; setPaymentAmount: (v: string) => void; paymentMethod: "cash" | "momo" | "card" | "bank" | "cheque"; setPaymentMethod: (v: "cash" | "momo" | "card" | "bank" | "cheque") => void; paymentReference: string; setPaymentReference: (v: string) => void; busy: boolean; submit: (e: FormEvent) => void }) {
  const selected = invoices.find((row) => row.id === invoiceId);
  return <><span className="fin-drawer-kicker">COLLECTION</span><h2>Record payment</h2><p>Choose the outstanding invoice and capture the exact transaction reference.</p><form className="fin-form" onSubmit={submit}><label>Outstanding invoice<select required value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setPaymentAmount(""); }}><option value="">Choose invoice</option>{invoices.map((row) => <option key={row.id} value={row.id}>{row.student?.name ?? "Student"} · {row.student?.admissionNo ?? row.id.slice(0, 8)} · due {money(row.due)}</option>)}</select></label>{selected ? <div className="fin-payment-context"><span>Invoice balance</span><strong>{money(selected.due)}</strong><small>{selected.student?.class?.name ?? "Class"} · {selected.term?.name ?? "Term"}</small></div> : null}<label>Amount received (GHS)<input required type="number" min="0.01" max={selected?.due} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="bank">Bank transfer/deposit</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label><label>Receipt / transaction reference<input required value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Unique receipt, MoMo or bank reference" /></label><div className="fin-form-note"><ShieldCheck size={15} /> Duplicate references and overpayments are blocked by the finance ledger.</div><button className="fin-primary" disabled={busy || !selected}>{busy ? "Recording…" : "Record payment"}</button></form></>;
}

function InvoiceDetail({ invoice, payments, canCollect, onCollect, onPayment }: { invoice: InvoiceRow; payments: PaymentRow[]; canCollect: boolean; onCollect: () => void; onPayment: (id: string) => void }) {
  return <><span className="fin-drawer-kicker">INVOICE</span><h2>{invoice.student?.name ?? "Student invoice"}</h2><p>{invoice.student?.admissionNo ?? invoice.id} · {invoice.student?.class?.name ?? "Class"} · {termName(invoice.term)}</p><div className="fin-detail-metrics"><div><span>Billed</span><strong>{money(invoice.total)}</strong></div><div><span>Paid</span><strong>{money(invoice.paid)}</strong></div><div><span>Balance</span><strong>{money(invoice.due)}</strong></div></div><div className="fin-detail-section"><h3>Invoice breakdown</h3><div className="fin-detail-list">{(invoice.lines ?? []).map((line, index) => <div key={`${line.feeItem?.id ?? "line"}-${index}`}><span>{line.feeItem?.name ?? "Fee item"}</span><strong>{money(line.amount)}</strong></div>)}{!(invoice.lines ?? []).length ? <div className="fin-empty">No line detail available.</div> : null}</div></div><div className="fin-detail-section"><h3>Payments</h3><div className="fin-detail-list">{payments.map((payment) => <button type="button" key={payment.id} onClick={() => onPayment(payment.id)}><span>{shortDate(payment.createdAt)} · {methodName(payment.method)}<small>{payment.reference || "No reference"}</small></span><strong>{money(payment.net)}</strong><ChevronRight size={14} /></button>)}{!payments.length ? <div className="fin-empty">No payments recorded for this invoice.</div> : null}</div></div>{invoice.due > 0 && canCollect ? <button type="button" className="fin-primary fin-full" onClick={onCollect}><WalletCards size={15} /> Collect against this invoice</button> : null}</>;
}

function PaymentDetail({ payment, reversals, canReverse, reversalAmount, setReversalAmount, reversalReason, setReversalReason, busy, submitReverse }: { payment: PaymentRow; reversals: Reversal[]; canReverse: boolean; reversalAmount: string; setReversalAmount: (v: string) => void; reversalReason: string; setReversalReason: (v: string) => void; busy: boolean; submitReverse: (e: FormEvent) => void }) {
  const unreversed = Math.max(0, payment.gross - payment.reversed);
  return <><span className="fin-drawer-kicker">PAYMENT RECEIPT</span><h2>{payment.invoice?.student?.name ?? "Payment"}</h2><p>{shortDate(payment.createdAt)} · {methodName(payment.method)} · {payment.reference || "No reference"}</p><div className="fin-detail-metrics"><div><span>Original</span><strong>{money(payment.gross)}</strong></div><div><span>Reversed</span><strong>{money(payment.reversed)}</strong></div><div><span>Net receipt</span><strong>{money(payment.net)}</strong></div></div><Link className="fin-primary fin-full" href={`/school/fees/receipt/${payment.id}`} target="_blank"><ReceiptText size={15} /> Open official receipt</Link>{reversals.length ? <div className="fin-detail-section"><h3>Reversal history</h3><div className="fin-detail-list">{reversals.map((row) => <div key={row.id}><span>{shortDate(row.createdAt)}<small>{row.reason}</small></span><strong>-{money(row.amount)}</strong></div>)}</div></div> : null}{canReverse && unreversed > 0 ? <details className="fin-reversal"><summary>Reverse all or part of this payment</summary><form className="fin-form compact" onSubmit={submitReverse}><label>Amount to reverse<input required type="number" min="0.01" max={unreversed} step="0.01" value={reversalAmount} onChange={(event) => setReversalAmount(event.target.value)} placeholder={money(unreversed)} /></label><label>Reason<textarea required minLength={2} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Why is this payment being reversed?" /></label><button className="fin-danger" disabled={busy}>{busy ? "Saving…" : "Record reversal"}</button></form></details> : null}</>;
}

function Reports({ data, termFilter, setTermFilter, classFilter, setClassFilter, totals, collectionRate, payments, invoices }: { data: FinanceData; termFilter: string; setTermFilter: (v: string) => void; classFilter: string; setClassFilter: (v: string) => void; totals: { billed: number; collected: number; owing: number; debtors: number }; collectionRate: number; payments: PaymentRow[]; invoices: InvoiceRow[] }) {
  const methodTotals = ["cash", "momo", "bank", "card", "cheque"].map((method) => ({ method, amount: payments.filter((row) => row.method === method).reduce((sum, row) => sum + row.net, 0), count: payments.filter((row) => row.method === method).length })).filter((row) => row.count > 0);
  const topArrears = [...invoices].filter((row) => row.due > 0).sort((a, b) => b.due - a.due).slice(0, 8);
  return <>
    <section className="fin-report-filter"><div><Filter size={15} /><strong>Report scope</strong><span>Change the term or class to recalculate the figures below.</span></div><select value={termFilter} onChange={(event) => setTermFilter(event.target.value)}><option value="">All terms</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{termName(term)}</option>)}</select><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">All classes</option>{data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></section>
    <section className="fin-metrics"><article><span className="fin-metric-icon"><FileText size={18} /></span><div><small>Billed</small><strong>{money(totals.billed)}</strong><p>{invoices.length} invoices</p></div></article><article><span className="fin-metric-icon"><WalletCards size={18} /></span><div><small>Collected</small><strong>{money(totals.collected)}</strong><p>{payments.length} payments</p></div></article><article><span className="fin-metric-icon"><CircleDollarSign size={18} /></span><div><small>Outstanding</small><strong>{money(totals.owing)}</strong><p>{totals.debtors} debtor accounts</p></div></article><article><span className="fin-metric-icon"><BarChart3 size={18} /></span><div><small>Collection rate</small><strong>{collectionRate}%</strong><progress max={100} value={collectionRate} /></div></article></section>
    <section className="fin-overview-grid"><div className="fin-card"><Header eyebrow="PAYMENT MIX" title="Collections by method" subtitle="Net of recorded reversals in this report scope." /><div className="fin-method-list">{methodTotals.map((row) => <div key={row.method}><span><strong>{methodName(row.method)}</strong><small>{row.count} transaction{row.count === 1 ? "" : "s"}</small></span><b>{money(row.amount)}</b></div>)}{!methodTotals.length ? <div className="fin-empty">No payments in this report scope.</div> : null}</div></div><div className="fin-card"><Header eyebrow="EXPOSURE" title="Largest outstanding accounts" subtitle="Top balances only; use Arrears for the full collection register." /><div className="fin-method-list">{topArrears.map((row) => <div key={row.id}><span><strong>{row.student?.name ?? "Student"}</strong><small>{row.student?.class?.name ?? "Class"} · {row.term?.name ?? "Term"}</small></span><b>{money(row.due)}</b></div>)}{!topArrears.length ? <div className="fin-empty">No outstanding balances.</div> : null}</div></div></section>
    <section className="fin-card"><Header eyebrow="CONTROLLED EXPORTS" title="Download finance datasets" subtitle="Bulk downloads remain permission-controlled and use the server-side export service." /><div className="fin-export-grid">{data.permissions.canExportFinance ? <><a href="/api/school/exports/fees"><FileText size={18} /><span><strong>Fees & invoice ledger</strong><small>Established finance CSV structure</small></span><ArrowRight size={15} /></a><a href="/api/school/exports/payments"><ReceiptText size={18} /><span><strong>Payments</strong><small>Receipt-level collection extract</small></span><ArrowRight size={15} /></a><a href="/api/school/exports/arrears"><CircleDollarSign size={18} /><span><strong>Arrears</strong><small>Outstanding balances extract</small></span><ArrowRight size={15} /></a></> : <div className="fin-empty">Your account can view finance reports but does not have bulk finance export permission.</div>}</div></section>
  </>;
}
