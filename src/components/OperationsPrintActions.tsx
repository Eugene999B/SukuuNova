"use client";

import { Download, Printer } from "lucide-react";

export default function OperationsPrintActions() {
  return <div className="ops-print-actions"><button type="button" className="primary" onClick={() => window.print()} title="Choose Save as PDF in the browser print dialog"><Download size={14}/>Download / save PDF</button><button type="button" onClick={() => window.print()}><Printer size={14}/>Print</button></div>;
}
