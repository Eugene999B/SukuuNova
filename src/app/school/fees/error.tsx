"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import "@/components/finance-workspace.css";

export default function FinanceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("SukuuNova finance route error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="fin-shell">
        <section className="fin-state error">
          <TriangleAlert size={28} />
          <strong>Finance workspace could not be opened.</strong>
          <span>
            This finance page hit an unexpected problem. Your school session and the rest of SukuuNova are still protected.
          </span>
          <div className="fin-inline-actions">
            <button type="button" className="fin-primary" onClick={reset}>
              <RefreshCw size={14} /> Try finance again
            </button>
            <Link className="fin-secondary" href="/school/fees">
              Finance overview
            </Link>
            <Link className="fin-secondary" href="/dashboard">
              School home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
