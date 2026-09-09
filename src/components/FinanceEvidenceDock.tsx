"use client";

import Link from "next/link";
import "./finance-evidence-dock-simple.css";

export function FinanceEvidenceDock() {
  return (
    <details className="finance-evidence-dock" aria-label="Finance evidence and printing">
      <summary><span>Evidence & printing</span><small>Receipts, statements and exports</small></summary>
      <div className="finance-evidence-actions">
        <Link href="/school/fees/evidence">Open Evidence Centre →</Link>
        <button type="button" onClick={() => window.print()}>Print this view</button>
      </div>
    </details>
  );
}
