"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, ShieldAlert } from "lucide-react";

export default function AcademicSetupError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Academic Setup route failed", error);
  }, [error]);

  return <main className="academic-page">
    <section className="academic-page-hero">
      <div className="academic-page-hero-copy">
        <span className="academic-page-overline">ACADEMIC SETUP · RECOVERY</span>
        <h1>Academic Setup could not be loaded safely.</h1>
        <p>The failure has been contained inside Academic Setup. Your school session and the rest of the school workspace remain separate and unchanged.</p>
      </div>
      <div className="academic-page-actions">
        <button type="button" className="academic-btn-secondary" onClick={reset}><RefreshCw size={15} /> Retry setup</button>
        <Link className="academic-btn-secondary" href="/school/academics/health"><ShieldAlert size={15} /> Academic readiness</Link>
      </div>
    </section>
  </main>;
}
