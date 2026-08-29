"use client";

import { useEffect, useMemo, useState } from "react";
import "./finance-evidence.css";

type Term = { id: string; name: string; academicYear?: { name: string } | null };
type Student = { id: string; name: string; admissionNo: string; class?: { name: string } | null };
type Invoice = { id: string; student?: { name: string; admissionNo?: string }; term?: { id?: string; name: string }; totalAmount: number | string; status: string };
type Payment = { id: string; invoiceId: string; amount: number | string; method: string; reference?: string | null; createdAt: string };
type Reversal = { id: string; paymentId: string; amount: number | string };
type Finance = { terms: Term[]; students: Student[]; invoices: Invoice[]; payments: Payment[]; reversals: Reversal[] };
type Payroll = { canManage: boolean; structures: Array<{ id:string; staffId:string; grossSalary:number|string; deductions?: unknown; staff?:{name:string} }>; runs: Array<{id:string;period:string;status:string}>; payslips: Array<{id:string;staffId:string;gross:number|string;net:number|string;payrollRun?:{period:string}}>; };

type Kind = "receipt" | "student" | "invoice" | "salary" | "payroll" | "arrears" | "finance";

const money = (v: number | string) => `GHS ${Number(v || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (v: string | undefined) => v ? new Date(v).toLocaleDateString("en-GH", { day:"2-digit", month:"short", year:"numeric" }) : "—";

function EvidenceHeader({ schoolName, title, subtitle }: { schoolName: string; title: string; subtitle: string }) {
  return <header className="evidence-paper-head"><div className="evidence-brand"><img src="/icon.svg" alt="" /><div><strong>{schoolName}</strong><small>SukuuNova Finance Evidence</small></div></div><div className="evidence-title"><h1>{title}</h1><p>{subtitle}</p></div><div className="evidence-meta"><span>Generated</span><b>{new Date().toLocaleString("en-GH")}</b></div></header>;
}

export default function FinanceEvidenceCentre() {
  const [finance, setFinance] = useState<Finance | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [schoolName, setSchoolName] = useState("School");
  const [kind, setKind] = useState<Kind>("receipt");
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0,7));
  const [paper, setPaper] = useState<"a4"|"thermal">("a4");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/mvp/finance", { cache:"no-store" }), fetch("/api/phase2/payroll", { cache:"no-store" }), fetch("/api/school/settings", { cache:"no-store" })])
      .then(async ([f,p,s]) => {
        if (!f.ok) throw new Error("Finance data could not be loaded.");
        const fd = await f.json();
        setFinance(fd);
        if (p.ok) setPayroll(await p.json());
        if (s.ok) {
          const sd = await s.json().catch(() => null);
          setSchoolName(sd?.school?.name ?? sd?.name ?? "School");
        }
      })
      .catch(e => setMessage(e instanceof Error ? e.message : "Evidence data could not be loaded."));
  }, []);

  const invoiceMap = useMemo(() => new Map((finance?.invoices ?? []).map(i => [i.id, i])), [finance]);
  const payments = finance?.payments ?? [];
  const filteredPayments = useMemo(() => payments.filter(p => {
    const inv = invoiceMap.get(p.invoiceId);
    const studentMatch = !studentId || (() => {
      const name = inv?.student?.name ?? "";
      const adm = inv?.student?.admissionNo ?? "";
      return (finance?.students ?? []).find(s => s.id === studentId && (s.name === name || s.admissionNo === adm));
    })();
    const termMatch = !termId || String(inv?.term?.id ?? "") === termId || (finance?.terms ?? []).some(t => t.id === termId && t.name === inv?.term?.name);
    return studentMatch && termMatch;
  }), [payments, invoiceMap, studentId, termId, finance]);

  const selectedPayment = payments.find(p => p.id === paymentId) ?? filteredPayments[0];
  const selectedInvoice = invoiceMap.get(invoiceId) ?? (selectedPayment ? invoiceMap.get(selectedPayment.invoiceId) : undefined);
  const selectedStudent = (finance?.students ?? []).find(s => s.id === studentId) ?? selectedInvoice?.student;
  const studentPayments = useMemo(() => {
    if (!studentId) return filteredPayments;
    return filteredPayments;
  }, [filteredPayments, studentId]);
  const salaryRows = useMemo(() => (payroll?.payslips ?? []).filter(p => !period || p.payrollRun?.period === period).filter(p => !staffId || p.staffId === staffId), [payroll, period, staffId]);
  const invoiceRows = useMemo(() => (finance?.invoices ?? []).filter(i => (!studentId || i.student?.admissionNo === (finance?.students ?? []).find(s => s.id === studentId)?.admissionNo) && (!termId || i.term?.id === termId || i.term?.name === (finance?.terms ?? []).find(t => t.id === termId)?.name)), [finance, studentId, termId]);

  const title = kind === "receipt" ? "Payment Receipt" : kind === "student" ? "Student Payment History" : kind === "invoice" ? "Invoice & Ledger Evidence" : kind === "salary" ? "Staff Salary Payment" : kind === "payroll" ? "Payroll Payment Register" : kind === "arrears" ? "Arrears Statement" : "Finance Summary";
  const subtitle = kind === "student" ? `${selectedStudent?.name ?? "Selected student"} · ${termId ? "Selected term" : "All academic terms"}` : kind === "salary" || kind === "payroll" ? `Payroll period ${period || "all periods"}` : "Official financial evidence generated from SukuuNova records";

  function openPrint() {
    document.documentElement.dataset.printPaper = paper;
    window.print();
  }

  function downloadCsv() {
    let rows: string[][] = [];
    if (kind === "student") rows = [["Date","Student","Admission No","Term","Amount","Method","Reference"], ...studentPayments.map(p => { const i=invoiceMap.get(p.invoiceId); return [fmtDate(p.createdAt), i?.student?.name ?? "", i?.student?.admissionNo ?? "", i?.term?.name ?? "", String(p.amount), p.method, p.reference ?? ""]; })];
    else if (kind === "receipt" && selectedPayment) rows = [["Receipt","Date","Student","Term","Amount","Method","Reference"],[selectedPayment.id,fmtDate(selectedPayment.createdAt),selectedPayment?.invoiceId ? (invoiceMap.get(selectedPayment.invoiceId)?.student?.name ?? "") : "",invoiceMap.get(selectedPayment.invoiceId)?.term?.name ?? "",String(selectedPayment.amount),selectedPayment.method,selectedPayment.reference ?? ""]];
    else if (kind === "salary") rows = [["Payslip","Period","Staff","Gross","Net"], ...salaryRows.map(p=>[p.id,p.payrollRun?.period ?? "",p.staffId,String(p.gross),String(p.net)])];
    else rows = [["Student","Term","Invoice","Billed","Status"], ...invoiceRows.map(i=>[i.student?.name ?? "",i.term?.name ?? "",i.id,String(i.totalAmount),i.status])];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`sukuunova-${kind}-evidence.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (!finance) return <main className="evidence-app"><div className="evidence-loading">{message || "Loading finance evidence…"}</div></main>;

  return <main className="evidence-app">
    <div className="evidence-controls no-print"><div><span className="evidence-kicker">FINANCE EVIDENCE CENTRE</span><h2>Print or export any financial record</h2><p>Every output carries the school identity, date, scope and source context. Use A4 for filing, thermal for counter receipts, or CSV for reconciliation.</p></div><div className="evidence-control-grid"><label>Document<select value={kind} onChange={e=>setKind(e.target.value as Kind)}><option value="receipt">Payment receipt</option><option value="student">Student payment history</option><option value="invoice">Invoice / ledger</option><option value="salary">Staff salary payment</option><option value="payroll">Payroll register</option><option value="arrears">Arrears statement</option><option value="finance">Finance summary</option></select></label><label>Student<select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">All / choose student</option>{finance.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admissionNo}</option>)}</select></label><label>Academic term<select value={termId} onChange={e=>setTermId(e.target.value)}><option value="">All terms</option>{finance.terms.map(t=><option key={t.id} value={t.id}>{t.academicYear?.name ? `${t.academicYear.name} · ` : ""}{t.name}</option>)}</select></label><label>Payment<select value={paymentId} onChange={e=>setPaymentId(e.target.value)}><option value="">Latest matching</option>{filteredPayments.map(p=><option key={p.id} value={p.id}>{fmtDate(p.createdAt)} · {money(p.amount)}</option>)}</select></label><label>Staff<select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All staff</option>{payroll?.payslips?.map(p=><option key={p.staffId} value={p.staffId}>{p.staffId}</option>)}</select></label><label>Payroll period<input type="month" value={period} onChange={e=>setPeriod(e.target.value)} /></label><label>Paper<select value={paper} onChange={e=>setPaper(e.target.value as "a4"|"thermal")}><option value="a4">A4 filing</option><option value="thermal">80mm thermal receipt</option></select></label></div><div className="evidence-buttons"><button onClick={openPrint}>Print / Save PDF</button><button onClick={downloadCsv}>Download CSV</button><button type="button" onClick={() => window.history.back()}>Back to Finance</button></div></div>

    <section className={`evidence-paper ${paper === "thermal" ? "thermal" : ""}`}>
      <EvidenceHeader schoolName={schoolName} title={title} subtitle={subtitle} />
      {message && <div className="evidence-message">{message}</div>}
      {kind === "receipt" && selectedPayment && <><div className="evidence-receipt-no"><span>Receipt No.</span><strong>{selectedPayment.id}</strong></div><div className="evidence-summary"><div><span>Received from</span><strong>{selectedInvoice?.student?.name ?? "Student"}</strong><small>{selectedInvoice?.student?.admissionNo ?? "—"}</small></div><div><span>Amount received</span><strong className="amount">{money(selectedPayment.amount)}</strong><small>{selectedPayment.method.toUpperCase()}</small></div><div><span>Date</span><strong>{fmtDate(selectedPayment.createdAt)}</strong><small>{selectedPayment.reference ?? "No external reference"}</small></div></div><table><tbody><tr><th>Academic term</th><td>{selectedInvoice?.term?.name ?? "—"}</td></tr><tr><th>Invoice</th><td>{selectedPayment.invoiceId}</td></tr><tr><th>Payment method</th><td>{selectedPayment.method}</td></tr><tr><th>Reference</th><td>{selectedPayment.reference ?? "—"}</td></tr></tbody></table><div className="evidence-note">This receipt is evidence of the payment recorded in SukuuNova. Reversals do not erase the original transaction.</div></>}
      {kind === "student" && <><div className="evidence-summary"><div><span>Student</span><strong>{selectedStudent?.name ?? "Select a student"}</strong><small>{selectedStudent?.admissionNo ?? ""}</small></div><div><span>Scope</span><strong>{termId ? finance.terms.find(t=>t.id===termId)?.name ?? "Selected term" : "All terms"}</strong><small>{studentPayments.length} payments</small></div><div><span>Total paid</span><strong className="amount">{money(studentPayments.reduce((s,p)=>s+Number(p.amount),0))}</strong><small>Recorded payments</small></div></div><table><thead><tr><th>Date</th><th>Term</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{studentPayments.map(p=><tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{invoiceMap.get(p.invoiceId)?.term?.name ?? "—"}</td><td>{p.invoiceId}</td><td>{p.method}</td><td>{p.reference ?? "—"}</td><td>{money(p.amount)}</td></tr>)}{studentPayments.length===0 && <tr><td colSpan={6}>No payments match this selection.</td></tr>}</tbody></table></>}
      {(kind === "invoice" || kind === "arrears") && <><div className="evidence-summary"><div><span>Records</span><strong>{invoiceRows.length}</strong><small>Invoices in scope</small></div><div><span>Billed</span><strong>{money(invoiceRows.reduce((s,i)=>s+Number(i.totalAmount),0))}</strong></div><div><span>Selection</span><strong>{studentId ? selectedStudent?.name ?? "Student" : "All students"}</strong><small>{termId ? finance.terms.find(t=>t.id===termId)?.name ?? "Term" : "All terms"}</small></div></div><table><thead><tr><th>Student</th><th>Admission</th><th>Term</th><th>Invoice</th><th>Amount</th><th>Status</th></tr></thead><tbody>{invoiceRows.map(i=><tr key={i.id}><td>{i.student?.name ?? "—"}</td><td>{i.student?.admissionNo ?? "—"}</td><td>{i.term?.name ?? "—"}</td><td>{i.id}</td><td>{money(i.totalAmount)}</td><td>{i.status}</td></tr>)}</tbody></table></>}
      {(kind === "salary" || kind === "payroll") && <><div className="evidence-summary"><div><span>Payroll period</span><strong>{period}</strong></div><div><span>Staff payments</span><strong>{salaryRows.length}</strong></div><div><span>Total net</span><strong className="amount">{money(salaryRows.reduce((s,p)=>s+Number(p.net),0))}</strong></div></div><table><thead><tr><th>Staff</th><th>Period</th><th>Gross</th><th>Net paid</th><th>Payslip</th></tr></thead><tbody>{salaryRows.map(p=><tr key={p.id}><td>{p.staff?.name ?? p.staffId}</td><td>{p.payrollRun?.period ?? period}</td><td>{money(p.gross)}</td><td>{money(p.net)}</td><td>{p.id}</td></tr>)}{salaryRows.length===0 && <tr><td colSpan={5}>No payroll payments match this selection.</td></tr>}</tbody></table></>}
      {kind === "finance" && <><div className="evidence-summary"><div><span>Invoices</span><strong>{finance.invoices.length}</strong></div><div><span>Total billed</span><strong>{money(finance.invoices.reduce((s,i)=>s+Number(i.totalAmount),0))}</strong></div><div><span>Payments</span><strong>{finance.payments.length}</strong></div></div><table><thead><tr><th>Payment date</th><th>Student</th><th>Term</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{finance.payments.map(p=><tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{invoiceMap.get(p.invoiceId)?.student?.name ?? "—"}</td><td>{invoiceMap.get(p.invoiceId)?.term?.name ?? "—"}</td><td>{p.method}</td><td>{p.reference ?? "—"}</td><td>{money(p.amount)}</td></tr>)}</tbody></table></>}
      <footer className="evidence-footer"><span>Generated from SukuuNova Finance</span><span>School record • retain with supporting documents</span><span>{new Date().toLocaleDateString("en-GH")}</span></footer>
    </section>
  </main>;
}
