"use client";

import { Download, Printer } from "lucide-react";

export default function GuardianReceiptPrintButton() {
  return <div className="gfr-print-actions"><button type="button" className="gfr-print primary" onClick={() => window.print()} title="Choose Save as PDF in the print dialog"><Download size={14}/>Download / save PDF</button><button type="button" className="gfr-print" onClick={() => window.print()}><Printer size={14}/>Print receipt</button></div>;
}
