"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import "./finance-workspace.css";

type Term = { id: string; name: string; academicYear?: { name: string } | null };
type ClassRow = { id: string; name: string };
type Student = { id: string; name: string; admissionNo: string; class?: { name: string } | null };
type FeeItem = { id: string; name: string; amount: number | string; term?: { name: string } | null; class?: { name: string } | null };
type Invoice = { id: string; student?: { name: string; admissionNo?: string }; term?: { name: string }; totalAmount: number | string; status: string; lines?: Array<{ amount: number | string }> };
type Payment = { id: string; invoiceId: string; amount: number | string; method: string; reference?: string | null; createdAt: string };
type FinanceData = { feeItems: FeeItem[]; invoices: Invoice[]; payments: Payment[]; reversals: Array<{ id: string; paymentId: string; amount: number | string }> ; terms: Term[]; classes: ClassRow[]; students: Student[] };
type PayrollData = { canManage: boolean; structures: Array<{ id:string; staffId:string; grossSalary:number|string; deductions:unknown; staff?:{name:string} }>; runs: Array<{id:string;period:string;status:string}>; payslips: Array<{id:string;staffId:string;gross:number|string;net:number|string;payrollRun?:{period:string}}>};

const money = (value: number | string) => `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString("en-GH", { day:"2-digit", month:"short", year:"numeric" });

export default function FinanceWorkspace({ mode = "overview", schoolName = "School" }: { mode?: "overview"|"fees"|"invoices"|"payments"|"arrears"|"reports"|"payroll"; schoolName?: string }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash"|"momo"|"card">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [payrollPeriod, setPayrollPeriod] = useState(new Date().toISOString().slice(0,7));

  async function load() {
    setBusy(true); setNotice("");
    try {
      const [f, p] = await Promise.all([fetch("/api/mvp/finance", { cache:"no-store" }), fetch("/api/phase2/payroll", { cache:"no-store" })]);
      if (!f.ok) throw new Error("Finance data could not be loaded.");
      const finance = await f.json();
      setData(finance);
      if (p.ok) setPayroll(await p.json());
    } catch (error) { setNotice(error instanceof Error ? error.message : "Finance data could not be loaded."); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    (data?.payments ?? []).forEach(p => map.set(p.invoiceId, (map.get(p.invoiceId) ?? 0) + Number(p.amount)));
    (data?.reversals ?? []).forEach(r => {
      const payment = data?.payments.find(p => p.id === r.paymentId);
      if (payment) map.set(payment.invoiceId, (map.get(payment.invoiceId) ?? 0) - Number(r.amount));
    });
    return map;
  }, [data]);

  const invoiceRows = useMemo(() => (data?.invoices ?? []).map(i => ({ ...i, total:Number(i.totalAmount), paid:paidByInvoice.get(i.id) ?? 0, due:Math.max(0, Number(i.totalAmount) - (paidByInvoice.get(i.id) ?? 0)) })), [data, paidByInvoice]);
  const filteredInvoices = invoiceRows.filter(i => !query || `${i.student?.name ?? ""} ${i.student?.admissionNo ?? ""} ${i.id}`.toLowerCase().includes(query.toLowerCase()));
  const totals = useMemo(() => ({ billed:invoiceRows.reduce((s,i)=>s+i.total,0), collected:invoiceRows.reduce((s,i)=>s+i.paid,0), owing:invoiceRows.reduce((s,i)=>s+i.due,0), payments:(data?.payments ?? []).reduce((s,p)=>s+Number(p.amount),0) }), [invoiceRows, data]);
  const arrears = filteredInvoices.filter(i => i.due > 0).sort((a,b)=>b.due-a.due);

  async function post(endpoint:string, body:unknown) {
    setBusy(true); setNotice("");
    try {
      const res = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.error ?? payload?.message ?? "The action could not be completed.");
      await load();
      setNotice("Saved successfully.");
    } catch(error) { setNotice(error instanceof Error ? error.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }

  const createFee = (e:FormEvent) => { e.preventDefault(); if (!termId || !feeName || !feeAmount) return setNotice("Choose a term and enter the fee name and amount."); post("/api/mvp/finance", { action:"feeItem", termId, classId:classId||undefined, name:feeName, amount:Number(feeAmount) }); };
  const createInvoice = (e:FormEvent) => { e.preventDefault(); if (!termId || !studentId) return setNotice("Choose the academic term and student."); post("/api/mvp/finance", { action:"invoice", termId, studentId }); };
  const recordPayment = (e:FormEvent) => { e.preventDefault(); if (!invoiceId || !paymentAmount) return setNotice("Choose an invoice and enter the payment amount."); post("/api/mvp/finance", { action:"payment", invoiceId, amount:Number(paymentAmount), method:paymentMethod, reference:paymentReference||undefined }); };

  const title = mode === "fees" ? "Fee Setup" : mode === "invoices" ? "Invoices" : mode === "payments" ? "Payments & Receipts" : mode === "arrears" ? "Arrears & Balances" : mode === "reports" ? "Finance Reports" : mode === "payroll" ? "Payroll & Salaries" : "Finance";
  const subtitle = mode === "fees" ? "Define what students owe by term, class and fee item." : mode === "invoices" ? "Create and track student bills with a clear running balance." : mode === "payments" ? "Record cash, MoMo and card payments with references and reversal history." : mode === "arrears" ? "See who owes, how much, and what needs follow-up." : mode === "reports" ? "Use financial totals for collection, arrears and payroll decisions." : mode === "payroll" ? "Manage staff salary structures, deductions and monthly payroll runs." : "One financial workspace for billing, collections, balances and payroll.";

  if (!data) return <section className="finance-app"><div className="finance-loading">{notice || "Loading finance…"}</div></section>;

  return <div className="finance-app">
    <section className="finance-hero"><div><span className="finance-kicker">FINANCE CONTROL CENTRE</span><h1>{title}</h1><p>{subtitle}</p></div><div className="finance-hero-actions"><Link href="/school/fees">Overview</Link><Link href="/school/fees/payments">Record payment</Link><Link href="/school/fees/arrears">Arrears</Link><Link href="/school/fees/payroll">Payroll</Link></div></section>
    {notice && <div className="finance-notice">{notice}</div>}
    <section className="finance-metrics"><div><span>Total billed</span><strong>{money(totals.billed)}</strong><small>Active invoices</small></div><div><span>Collected</span><strong>{money(totals.collected)}</strong><small>Applied to invoices</small></div><div><span>Outstanding</span><strong>{money(totals.owing)}</strong><small>Student balances</small></div><div><span>Payments</span><strong>{data.payments.length}</strong><small>Recorded receipts</small></div></section>

    {(mode === "overview" || mode === "fees") && <section className="finance-grid"><div className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">SETUP</span><h2>Fee structure</h2><p>Create tuition, feeding, transport, examination, activity or any other billable item.</p></div></div><form className="finance-form" onSubmit={createFee}><select value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Academic term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{t.academicYear?.name ? `${t.academicYear.name} · ` : ""}{t.name}</option>)}</select><select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">All classes</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={feeName} onChange={e=>setFeeName(e.target.value)} placeholder="Fee item · e.g. Tuition"/><input type="number" min="0.01" step="0.01" value={feeAmount} onChange={e=>setFeeAmount(e.target.value)} placeholder="Amount (GHS)"/><button disabled={busy}>Create fee item</button></form><div className="finance-chips">{["Tuition","Feeding","Transport","Examination","Activities","Development Levy"].map(x=><span key={x}>{x}</span>)}</div></div><div className="finance-panel finance-accent"><span className="finance-kicker">COLLECTION MODEL</span><h2>Bill → collect → reconcile</h2><p>Fee items drive invoices. Payments reduce the same invoice balance. Reversals stay visible and never erase the audit trail.</p><div className="finance-flow"><b>1</b><span>Set term/class fees</span><b>2</b><span>Generate student bill</span><b>3</b><span>Record payment + receipt</span><b>4</b><span>Review balance</span></div></div></section>}

    {(mode === "overview" || mode === "invoices") && <section className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">BILLING</span><h2>Create invoice</h2><p>Invoices are generated from the selected student's applicable term/class fee items.</p></div></div><form className="finance-form four" onSubmit={createInvoice}><select value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Academic term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Student</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admissionNo}</option>)}</select><button disabled={busy}>Generate invoice</button></form></section>}

    {(mode === "overview" || mode === "payments") && <section className="finance-grid"><div className="finance-panel"><div className="finance-head"><div><span className="finance-kicker">COLLECTION</span><h2>Record a payment</h2><p>Search the invoice, verify the outstanding amount, then record the actual amount received.</p></div></div><form className="finance-form" onSubmit={recordPayment}><select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}><option value="">Invoice</option>{invoiceRows.filter(i=>i.due>0).map(i=><option key={i.id} value={i.id}>{i.student?.name ?? "Student"} · due {money(i.due)}</option>)}</select><input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} placeholder="Amount received"/><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)}><option value="cash">Cash</option><option value="momo">MoMo</option><option value="card">Card</option></select><input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder={paymentMethod === "momo" ? "MoMo reference (required)" : "Reference / receipt note"}/><button disabled={busy}>Record payment</button></form></div><div className="finance-panel finance-accent"><span className="finance-kicker">PAYMENT SAFETY</span><h2>No silent overpayments</h2><p>The existing finance service rejects payments above the current invoice balance and requires a reason for reversals.</p><div className="finance-safety">✓ Partial payments supported<br/>✓ MoMo reference capture<br/>✓ Reconciliation actor recorded<br/>✓ Reversals remain auditable</div></div></section>}

    {(mode === "overview" || mode === "invoices" || mode === "payments") && <section className="finance-panel"><div className="finance-head finance-head-row"><div><span className="finance-kicker">LEDGER</span><h2>Recent financial activity</h2></div><input className="finance-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search student or invoice…"/></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Student</th><th>Term</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{filteredInvoices.slice(0,50).map(i=><tr key={i.id}><td><b>{i.student?.name ?? "—"}</b><small>{i.student?.admissionNo ?? i.id.slice(0,8)}</small></td><td>{i.term?.name ?? "—"}</td><td>{money(i.total)}</td><td>{money(i.paid)}</td><td className={i.due>0?"due":"paid"}>{money(i.due)}</td><td><span className={`finance-status ${i.due===0?"good":i.paid>0?"mid":"bad"}`}>{i.due===0?"Paid":i.paid>0?"Part paid":"Unpaid"}</span></td></tr>)}{filteredInvoices.length===0 && <tr><td colSpan={6}><div className="finance-empty">No invoices match your search.</div></td></tr>}</tbody></table></div></section>}

    {mode === "arrears" && <section className="finance-panel"><div className="finance-head finance-head-row"><div><span className="finance-kicker">COLLECTION PRIORITY</span><h2>Who owes money?</h2><p>Balances are calculated from invoices minus recorded payments and reversals.</p></div><input className="finance-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search debtor…"/></div><div className="arrears-list">{arrears.map(i=><article key={i.id}><div><b>{i.student?.name ?? "Student"}</b><span>{i.term?.name ?? "Term"} · Invoice {i.id.slice(0,8)}</span></div><strong>{money(i.due)}</strong><Link href={`/school/fees/payments?invoice=${i.id}`}>Collect →</Link></article>)}{arrears.length===0 && <div className="finance-empty">No outstanding balances in this view.</div>}</div></section>}

    {mode === "reports" && <section className="finance-report-grid"><article><span>Collection rate</span><strong>{totals.billed ? `${Math.round(totals.collected/totals.billed*100)}%` : "0%"}</strong><small>Paid ÷ billed</small></article><article><span>Debtor accounts</span><strong>{arrears.length}</strong><small>Invoices with a balance</small></article><article><span>Average balance</span><strong>{money(arrears.length ? totals.owing/arrears.length : 0)}</strong><small>Across owing invoices</small></article><article><span>Payment count</span><strong>{data.payments.length}</strong><small>Recorded transactions</small></article><div className="finance-panel full"><h2>Finance report exports</h2><p>Use the Downloads & Exports area for institution-wide extracts. The finance tables here are the operational source for billed, collected and outstanding figures.</p><div className="finance-export-links"><Link href="/school/downloads">Downloads & Exports →</Link><Link href="/school/reports">Reports →</Link><Link href="/school/reports/analytics">Analytics →</Link></div></div></section>}

    {mode === "payroll" && <section className="finance-grid"><div className="finance-panel"><span className="finance-kicker">PAYROLL</span><h2>Staff salary structures</h2><p>Payroll is kept separate from student billing but remains part of the same finance control centre.</p>{payroll?.canManage ? <><div className="finance-payroll-summary"><b>{payroll.structures.length}</b><span>staff with salary structures</span></div><Link className="finance-inline-link" href="/school/staff">Manage staff records →</Link></> : <div className="finance-empty">Your account can view its own payroll information but does not manage school-wide salary structures.</div>}</div><div className="finance-panel"><span className="finance-kicker">PAY RUN</span><h2>Create monthly payroll run</h2>{payroll?.canManage ? <form className="finance-form" onSubmit={e=>{e.preventDefault();post("/api/phase2/payroll",{action:"createRun",period:payrollPeriod})}}><input type="month" value={payrollPeriod} onChange={e=>setPayrollPeriod(e.target.value)}/><button disabled={busy}>Create payroll run</button></form> : <div className="finance-empty">Only authorised payroll managers can create and process school payroll.</div>}</div><div className="finance-panel full"><span className="finance-kicker">PAYROLL HISTORY</span><div className="finance-payroll-list">{(payroll?.runs ?? []).map(r=><article key={r.id}><div><b>{r.period}</b><span>{r.status}</span></div>{payroll?.canManage && r.status === "draft" && <button onClick={()=>post("/api/phase2/payroll",{action:"processRun",payrollRunId:r.id})} disabled={busy}>Process</button>}{payroll?.canManage && r.status === "processed" && <button onClick={()=>post("/api/phase2/payroll",{action:"markPaid",payrollRunId:r.id})} disabled={busy}>Mark paid</button>}</article>)}{!(payroll?.runs ?? []).length && <div className="finance-empty">No payroll runs yet.</div>}</div></div></section>}
  </div>;
}
