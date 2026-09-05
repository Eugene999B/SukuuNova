/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { getSchoolDocumentIdentity } from "@/lib/school-document-identity";

type Deduction = { label: string; amount: number | string };
type PayslipData = {
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown; watermark: string | null };
  staff: { name: string; email: string | null };
  period: string;
  gross: number;
  deductions: Deduction[];
  net: number;
};

function money(value: number) {
  return `GH₵ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "payslip";
}

export default function PayslipPrintStudio({ data }: { data: PayslipData }) {
  const identity = getSchoolDocumentIdentity(data.school);
  const style = { ["--document-primary" as string]: identity.primary, ["--document-accent" as string]: identity.accent } as CSSProperties;
  const totalDeductions = data.deductions.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const downloadHtml = () => {
    const root = document.querySelector(".school-payslip-paper");
    const css = document.querySelector("style[data-payslip-print]")?.textContent ?? "";
    if (!root) return;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${identity.name} - ${data.staff.name} Payslip</title><style>${css}</style></head><body><main class="payslip-export">${root.outerHTML}</main></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${safeName(data.staff.name)}-${safeName(data.period)}-payslip.html`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main className="payslip-studio" style={style}>
    <style data-payslip-print>{`
      .payslip-studio{min-height:100vh;background:#0e1b20;color:#eff8f6;padding:28px;font-family:Arial,Helvetica,sans-serif}.payslip-top{max-width:980px;margin:0 auto 18px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.payslip-top h1{margin:4px 0;font-size:28px;letter-spacing:-.035em}.payslip-top p{margin:0;max-width:650px;color:#8aa09e;font-size:11px;line-height:1.55}.payslip-actions{display:flex;gap:7px;flex-wrap:wrap}.payslip-actions button,.payslip-actions a{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;background:rgba(255,255,255,.05);color:#c6d9d6;text-decoration:none;font-size:9px;font-weight:900}.payslip-actions .primary{background:var(--document-primary);border-color:var(--document-primary);color:#fff}.payslip-stage{max-width:980px;margin:0 auto;padding:20px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025);overflow:auto}.payslip-paper-wrap{background:#dfe5e4;padding:22px;min-width:720px}.school-payslip-paper{width:210mm;min-height:210mm;margin:0 auto;background:#fff;color:#182628;padding:16mm;box-shadow:0 14px 35px rgba(0,0,0,.18);font-size:10px}.payslip-brand{display:grid;grid-template-columns:70px 1fr auto;gap:14px;align-items:center;border-bottom:3px solid var(--document-primary);padding-bottom:12px}.payslip-logo{width:66px;height:66px;border:1px solid #cbd7d6;display:grid;place-items:center;overflow:hidden}.payslip-logo img{width:100%;height:100%;object-fit:contain}.payslip-school{text-align:center}.payslip-school small{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:var(--document-primary);font-weight:900}.payslip-school h2{margin:3px 0;font-family:Georgia,"Times New Roman",serif;font-size:19px}.payslip-school span{font-size:7px;color:#657779}.payslip-period{text-align:right}.payslip-period span{display:block;font-size:6.5px;color:#718384;text-transform:uppercase;letter-spacing:.1em;font-weight:900}.payslip-period strong{display:block;margin-top:3px;font-size:11px}.payslip-title{margin:12px 0 10px;text-align:center}.payslip-title span{display:inline-block;padding:5px 12px;border:1px solid var(--document-primary);border-radius:999px;color:var(--document-primary);font-size:8px;letter-spacing:.14em;text-transform:uppercase;font-weight:900}.staff-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd7d6}.staff-grid div{padding:8px;border-right:1px solid #cbd7d6;border-bottom:1px solid #cbd7d6}.staff-grid div:nth-child(2n){border-right:0}.staff-grid div:nth-last-child(-n+2){border-bottom:0}.staff-grid label{display:block;font-size:6px;text-transform:uppercase;letter-spacing:.1em;color:#718384;font-weight:900;margin-bottom:3px}.staff-grid strong{font-size:9px}.pay-table{margin-top:11px;width:100%;border-collapse:collapse}.pay-table th,.pay-table td{border:1px solid #cbd7d6;padding:7px}.pay-table th{background:var(--document-accent);font-size:7px;text-transform:uppercase;letter-spacing:.08em;text-align:left}.pay-table th:last-child,.pay-table td:last-child{text-align:right}.pay-table td{font-size:8px}.net-box{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:11px 12px;background:var(--document-primary);color:#fff;border-radius:8px}.net-box span{font-size:8px;letter-spacing:.12em;text-transform:uppercase;font-weight:900}.net-box strong{font-size:15px}.payslip-note{margin-top:12px;padding-top:8px;border-top:1px solid #d7e0df;display:flex;justify-content:space-between;gap:10px;color:#708082;font-size:6.5px}.payslip-watermark{text-align:center;margin-top:5px;font-size:6px;letter-spacing:.15em;color:var(--document-primary);opacity:.5}.payslip-studio .empty-deductions{padding:12px;border:1px dashed #bdcbca;color:#738183;font-size:8px;text-align:center}.payslip-export .school-payslip-paper{box-shadow:none;margin:0 auto}.payslip-studio .payslip-paper-wrap{break-inside:avoid}.payslip-table-body tr{break-inside:avoid;page-break-inside:avoid}@media(max-width:760px){.payslip-studio{padding:14px}.payslip-top{flex-direction:column}.payslip-stage{padding:8px}.payslip-paper-wrap{padding:8px}.school-payslip-paper{transform-origin:top left}.payslip-actions{justify-content:flex-start}}@media print{body{background:#fff!important}.payslip-studio{background:#fff!important;padding:0!important;min-height:0}.payslip-top{display:none!important}.payslip-stage{border:0!important;padding:0!important;overflow:visible!important;background:#fff!important}.payslip-paper-wrap{padding:0!important;min-width:0!important;background:#fff!important}.school-payslip-paper{width:210mm!important;min-height:auto!important;margin:0!important;padding:14mm!important;box-shadow:none!important}.payslip-table{break-inside:auto}.payslip-table tr{break-inside:avoid;page-break-inside:avoid}@page{size:A4 portrait;margin:0}}
    `}</style>
    <section className="payslip-top"><div><small>PAYROLL / PRINT STUDIO</small><h1>School-branded payslip</h1><p>One clean HTML document grows naturally with every deduction line. Your school's identity stays with the document from preview to paper.</p></div><div className="payslip-actions"><button type="button" className="primary" onClick={() => window.print()}>Print / Save PDF</button><button type="button" onClick={downloadHtml}>Export HTML</button><Link href="/school/fees/payroll">← Payroll</Link></div></section>
    <section className="payslip-stage"><div className="payslip-paper-wrap"><article className="school-payslip-paper"><header className="payslip-brand"><div className="payslip-logo">{identity.logoUrl ? <img src={identity.logoUrl} alt={`${identity.name} logo`} /> : null}</div><div className="payslip-school"><small>Official payroll document</small><h2>{identity.name}</h2><span>School Code: {identity.uniqueCode}</span></div><div className="payslip-period"><span>Pay period</span><strong>{data.period}</strong></div></header>
      <div className="payslip-title"><span>Staff Payslip</span></div>
      <section className="staff-grid"><div><label>Staff member</label><strong>{data.staff.name}</strong></div><div><label>Staff email</label><strong>{data.staff.email || "—"}</strong></div></section>
      <table className="pay-table payslip-table"><thead><tr><th>Earnings / deductions</th><th>Amount</th></tr></thead><tbody className="payslip-table-body"><tr><td><b>Gross salary</b></td><td><b>{money(data.gross)}</b></td></tr>{data.deductions.map((row, index) => <tr key={`${row.label}-${index}`}><td>{row.label}</td><td>- {money(Number(row.amount || 0))}</td></tr>)}{!data.deductions.length ? <tr><td colSpan={2}><div className="empty-deductions">No deductions recorded for this payslip.</div></td></tr> : null}<tr><td><b>Total deductions</b></td><td><b>- {money(totalDeductions)}</b></td></tr></tbody></table>
      <div className="net-box"><span>Net pay</span><strong>{money(data.net)}</strong></div>
      <div className="payslip-note"><span>Issued by {identity.name}</span><span>Generated by SukuuNova</span></div><div className="payslip-watermark">{identity.watermark}</div>
    </article></div></section>
  </main>;
}
