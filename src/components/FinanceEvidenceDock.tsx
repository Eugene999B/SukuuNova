"use client";

import Link from "next/link";

export function FinanceEvidenceDock() {
  return (
    <div className="finance-evidence-dock" role="region" aria-label="Finance evidence and printing">
      <div>
        <span className="finance-evidence-kicker">EVIDENCE & PRINTING</span>
        <strong>Receipts, statements, salary records and finance reports</strong>
      </div>
      <div className="finance-evidence-actions">
        <Link href="/school/fees/evidence">Open Evidence Centre →</Link>
        <button type="button" onClick={() => window.print()}>Print this view</button>
      </div>
    </div>
  );
}
