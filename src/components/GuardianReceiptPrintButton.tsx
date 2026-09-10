"use client";

import { Printer } from "lucide-react";

export default function GuardianReceiptPrintButton() {
  return <button type="button" className="gfr-print" onClick={() => window.print()}><Printer size={14}/>Print / save PDF</button>;
}
