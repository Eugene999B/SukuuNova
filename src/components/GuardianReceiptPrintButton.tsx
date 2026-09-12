"use client";

import { Braces, Download, FileText, Printer, ReceiptText, Table2 } from "lucide-react";
import { usePathname } from "next/navigation";

export default function GuardianReceiptPrintButton() {
  const pathname=usePathname();
  const paymentId=pathname.split("/").filter(Boolean).at(-1)||"";
  const schoolReceipt=pathname.startsWith("/school/")&&Boolean(paymentId);
  const href=(format:string)=>`/api/school/finance-v2/receipt/${encodeURIComponent(paymentId)}?format=${encodeURIComponent(format)}`;
  if(!schoolReceipt){
    return <div className="gfr-print-actions"><button type="button" className="gfr-print primary" onClick={()=>window.print()} title="Choose Save as PDF in the print dialog"><Download size={14}/>Download / save PDF</button><button type="button" className="gfr-print" onClick={()=>window.print()}><Printer size={14}/>Print receipt</button></div>;
  }
  return <div className="gfr-print-actions" aria-label="Receipt downloads">
    <a className="gfr-print primary" href={href("thermal")} target="_blank" rel="noreferrer"><ReceiptText size={14}/>80 mm thermal</a>
    <a className="gfr-print" href={href("pdf")}><Download size={14}/>PDF</a>
    <a className="gfr-print" href={href("doc")}><FileText size={14}/>Word</a>
    <a className="gfr-print" href={href("csv")}><Table2 size={14}/>CSV</a>
    <a className="gfr-print" href={href("json")}><Braces size={14}/>JSON</a>
    <button type="button" className="gfr-print" onClick={()=>window.print()}><Printer size={14}/>Print current view</button>
  </div>;
}
