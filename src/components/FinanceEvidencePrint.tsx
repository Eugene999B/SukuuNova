"use client";

import { useEffect, useMemo, useState } from "react";
import "./finance-evidence.css";

type Term = { id: string; name: string; academicYear?: { name: string } | null };
type Student = { id: string; name: string; admissionNo: string; class?: { name: string } | null };
type Invoice = { id: string; student?: { name: string; admissionNo?: string }; term?: { id?: string; name: string } | null; totalAmount: number | string; status: string };
type Payment = { id: string; invoiceId: string; amount: number | string; method: string; reference?: string | null; createdAt: string };
type PayrollSlip = { id: string; staffId: string; gross: number | string; net: number | string; payrollRun?: { period: string } };
type Finance = { terms: Term[]; students: Student[]; invoices: Invoice[]; payments: Payment[] };
type Payroll = { payslips: PayrollSlip[] };
type Kind = "receipt" | "student" | "invoice" | "salary" | "payroll" | "arrears" | "finance";
type Paper = "a4" | "thermal";
type Format = "print" | "rtf" | "csv" | "html";

type SchoolSettings = { school?: { name?: string; logoUrl?: string | null }; name?: string; logoUrl?: string | null };

const money = (value: number | string) => `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

export default function FinanceEvidencePrint() {
  const [finance, setFinance] = useState<Finance | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [kind, setKind] = useState<Kind>("receipt");
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [period, setPeriod] = useState("");
  const [paper, setPaper] = useState<Paper>("a4");
  const [format, setFormat] = useState<Format>("print");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/mvp/finance", { cache: "no-store" }),
      fetch("/api/phase2/payroll", { cache: "no-store" }),
      fetch("/api/school/settings", { cache: "no-store" }),
    ]).then(async ([f, p, s]) => {
      if (!f.ok) throw new Error("Finance data could not be loaded.");
      setFinance(await f.json());
      if (p.ok) setPayroll(await p.json());
      if (s.ok) setSchool(await s.json());
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Evidence data could not be loaded."));
  }, []);

  const invoiceMap = useMemo(() => new Map((finance?.invoices ?? []).map(i => [i.id, i])), [finance]);
  const selectedStudent = useMemo(() => (finance?.students ?? []).find(s => s.id === studentId), [finance, studentId]);
  const scopedPayments = useMemo(() => (finance?.payments ?? []).filter(p => {
    const invoice = invoiceMap.get(p.invoiceId);
    const studentOk = !studentId || (invoice?.student?.admissionNo === selectedStudent?.admissionNo);
    const term = invoice?.term;
    const termOk = !termId || term?.id === termId || finance?.terms.some(t => t.id === termId && t.name === term?.name);
    return studentOk && termOk;
  }), [finance, invoiceMap, selectedStudent, studentId, termId]);
  const selectedPayment = paymentsPick(finance?.payments ?? [], paymentId, scopedPayments);
  const selectedInvoice = selectedPayment ? invoiceMap.get(selectedPayment.invoiceId) : undefined;
  const salaryRows = useMemo(() => (payroll?.payslips ?? []).filter(p => (!period || p.payrollRun?.period === period) && (!staffId || p.staffId === staffId)), [payroll, period, staffId]);
  const invoices = useMemo(() => (finance?.invoices ?? []).filter(i => (!studentId || i.student?.admissionNo === selectedStudent?.admissionNo) && (!termId || i.term?.id === termId || i.term?.name === finance?.terms.find(t => t.id === termId)?.name)), [finance, selectedStudent, studentId, termId]);
  const schoolName = school?.school?.name ?? school?.name ?? "School";
  const logoUrl = school?.school?.logoUrl ?? school?.logoUrl ?? null;
  const docTitle = kind === "receipt" ? "Payment Receipt" : kind === "student" ? "Student Payment Statement" : kind === "invoice" ? "Invoice Register" : kind === "salary" ? "Staff Salary Statement" : kind === "payroll" ? "Payroll Register" : kind === "arrears" ? "Arrears Statement" : "Finance Summary";

  const rows = useMemo((): string[][] => {
    if (kind === "receipt" && selectedPayment) return [["Receipt No.", selectedPayment.id], ["Date", date(selectedPayment.createdAt)], ["Student", selectedInvoice?.student?.name ?? "—"], ["Admission No.", selectedInvoice?.student?.admissionNo ?? "—"], ["Term", selectedInvoice?.term?.name ?? "—"], ["Method", selectedPayment.method], ["Reference", selectedPayment.reference ?? "—"], ["Amount", money(selectedPayment.amount)]];
    if (kind === "student") return [["Date", "Term", "Invoice", "Method", "Reference", "Amount"], ...scopedPayments.map(p => [date(p.createdAt), invoiceMap.get(p.invoiceId)?.term?.name ?? "—", p.invoiceId, p.method, p.reference ?? "—", money(p.amount)])];
    if (kind === "salary" || kind === "payroll") return [["Staff", "Period", "Gross", "Net", "Payslip"], ...salaryRows.map(p => [p.staffId, p.payrollRun?.period ?? period || "—", money(p.gross), money(p.net), p.id])];
    if (kind === "invoice" || kind === "arrears") return [["Student", "Admission", "Term", "Invoice", "Amount", "Status"], ...invoices.map(i => [i.student?.name ?? "—", i.student?.admissionNo ?? "—", i.term?.name ?? "—", i.id, money(i.totalAmount), i.status])];
    return [["Metric", "Value"], ["Invoices", String(finance?.invoices.length ?? 0)], ["Payments", String(finance?.payments.length ?? 0)], ["Students", String(finance?.students.length ?? 0)]];
  }, [kind, selectedPayment, selectedInvoice, scopedPayments, invoiceMap, salaryRows, period, invoices, finance]);

  function download() {
    if (format === "print") {
      document.documentElement.dataset.printPaper = paper;
      window.print();
      return;
    }
    const textRows = rows.map(r => r.join("\t")).join("\n");
    if (format === "csv") downloadBlob(rows.map(r => r.map(cell => `\"${cell.replace(/\"/g, '\"\"')}\"`).join(",")).join("\n"), "text/csv;charset=utf-8", `${kind}-evidence.csv`);
    if (format === "rtf") {
      const body = rows.map(r => r.join("\\tab ") + "\\line").join("\n");
      downloadBlob(`{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Aptos;}}\\fs22 \\b ${schoolName} \\b0\\line ${docTitle}\\line\\line ${body}}`, "application/rtf", `${kind}-evidence.rtf`);
    }
    if (format === "html") {
      const table = rows.map((r, i) => `<tr>${r.map(c => `<${i === 0 && (kind === "student" || kind === "salary" || kind === "payroll" || kind === "invoice" || kind === "arrears" || kind === "finance") ? "th" : "td"}>${esc(c)}</${i === 0 && (kind === "student" || kind === "salary" || kind === "payroll" || kind === "invoice" || kind === "arrears" || kind === "finance") ? "th" : "td"}>`).join("")}</tr>`).join("");
      downloadBlob(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>body{font:14px Arial;color:#172033;padding:36px}h1{margin:0 0 6px}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}th{background:#f3f6f5}header{display:flex;gap:14px;align-items:center;border-bottom:3px solid #176b61;padding-bottom:16px}header img{width:52px;height:52px;object-fit:contain}</style></head><body><header>${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ""}<div><h1>${esc(schoolName)}</h1><div>${esc(docTitle)}</div></div></header><table>${table}</table></body></html>`, "text/html;charset=utf-8", `${kind}-evidence.html`);
    }
    void textRows;
  }

  if (!finance) return <main className="evidence-app"><div className="evidence-loading">{error || "Loading finance evidence…"}</div></main>;

  return <main className="evidence-app">
    <section className="evidence-controls no-print">
      <div><span className="evidence-kicker">FINANCE EVIDENCE CENTRE</span><h2>Professional financial documents</h2><p>Select exactly what should appear, choose the paper format, then print or download a finished document.</p></div>
      <div className="evidence-control-grid">
        <label>Document<select value={kind} onChange={e => setKind(e.target.value as Kind)}><option value="receipt">Payment receipt</option><option value="student">Student payment statement</option><option value="invoice">Invoice register</option><option value="salary">Staff salary statement</option><option value="payroll">Payroll register</option><option value="arrears">Arrears statement</option><option value="finance">Finance summary</option></select></label>
        <label>Student<select value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">All students</option>{finance.students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.admissionNo}</option>)}</select></label>
        <label>Academic term<select value={termId} onChange={e => setTermId(e.target.value)}><option value="">All terms</option>{finance.terms.map(t => <option key={t.id} value={t.id}>{t.academicYear?.name ? `${t.academicYear.name} · ` : ""}{t.name}</option>)}</select></label>
        <label>Payment<select value={paymentId} onChange={e => setPaymentId(e.target.value)}><option value="">Latest matching</option>{scopedPayments.map(p => <option key={p.id} value={p.id}>{date(p.createdAt)} · {money(p.amount)}</option>)}</select></label>
        <label>Staff<select value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">All staff</option>{Array.from(new Set((payroll?.payslips ?? []).map(p => p.staffId))).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        <label>Payroll period<input type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label>
        <label>Paper<select value={paper} onChange={e => setPaper(e.target.value as Paper)}><option value="a4">A4</option><option value="thermal">80mm thermal</option></select></label>
        <label>Output<select value={format} onChange={e => setFormat(e.target.value as Format)}><option value="print">Print / Save PDF</option><option value="rtf">Word</option><option value="csv">CSV / Excel</option><option value="html">HTML</option></select></label>
      </div>
      <div className="evidence-buttons"><button onClick={download}>Create document</button><button type="button" onClick={() => window.history.back()}>Back to Finance</button></div>
    </section>
    <section className={`evidence-paper ${paper === "thermal" ? "thermal" : ""}`}>
      <header className="evidence-paper-head"><div className="evidence-brand">{logoUrl ? <img src={logoUrl} alt="" /> : <img src="/icon.svg" alt="" />}<div><strong>{schoolName}</strong><small>SukuuNova Finance Evidence</small></div></div><div className="evidence-title"><h1>{docTitle}</h1><p>Official financial record · {studentId ? selectedStudent?.name ?? "Selected student" : "School scope"}</p></div><div className="evidence-meta"><span>Generated</span><b>{date(new Date().toISOString())}</b></div></header>
      {kind === "receipt" && selectedPayment ? <><div className="evidence-receipt-no"><span>Receipt No.</span><strong>{selectedPayment.id}</strong></div><div className="evidence-summary"><div><span>Received from</span><strong>{selectedInvoice?.student?.name ?? "Student"}</strong><small>{selectedInvoice?.student?.admissionNo ?? "—"}</small></div><div><span>Amount received</span><strong className="amount">{money(selectedPayment.amount)}</strong><small>{selectedPayment.method.toUpperCase()}</small></div><div><span>Date</span><strong>{date(selectedPayment.createdAt)}</strong><small>{selectedPayment.reference ?? "No reference"}</small></div></div><table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table><div className="evidence-note">This document reflects the transaction recorded in SukuuNova. Reversals remain part of the audit history.</div></> : <><div className="evidence-summary"><div><span>School</span><strong>{schoolName}</strong><small>{studentId ? selectedStudent?.admissionNo ?? "" : "All students"}</small></div><div><span>Academic scope</span><strong>{termId ? finance.terms.find(t => t.id === termId)?.name ?? "Selected term" : "All terms"}</strong><small>{kind === "salary" || kind === "payroll" ? period || "All payroll periods" : `${rows.length > 1 ? rows.length - 1 : 0} records`}</small></div><div><span>Document</span><strong>{docTitle}</strong><small>Generated evidence</small></div></div><div className="evidence-table-wrap"><table><thead><tr>{rows[0]?.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, idx) => <tr key={idx}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div></>}
      <footer className="evidence-footer"><span>{schoolName}</span><span>Generated from SukuuNova Finance</span><span>Retain with supporting records</span></footer>
    </section>
  </main>;
}

function paymentsPick(all: Payment[], paymentId: string, scoped: Payment[]) {
  return all.find(p => p.id === paymentId) ?? scoped[0];
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
