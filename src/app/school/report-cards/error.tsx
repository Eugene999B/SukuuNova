"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ReportCardsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("SukuuNova report-card workflow error", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Report Cards</p>
        <h1 className="text-3xl font-semibold tracking-tight">The report could not be prepared</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          SukuuNova stopped this report operation instead of producing a partial or unsafe document. Retry the operation, or return to Report Cards and try the learner individually.
        </p>
        {error.digest ? <p className="mt-3 text-xs text-muted-foreground">Support reference: {error.digest}</p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">Retry</button>
          <Link href="/school/report-cards" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Back to Report Cards</Link>
          <Link href="/school/downloads" className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Downloads</Link>
        </div>
      </div>
    </main>
  );
}
