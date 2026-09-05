"use client";

import { useState } from "react";

export function StudentPrintActions({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [state, setState] = useState<{ kind: "idle" | "working" | "error" | "done"; message?: string }>({ kind: "idle" });

  async function downloadIdCard() {
    setState({ kind: "working" });
    try {
      const res = await fetch(`/api/school/identity-cards/student/${encodeURIComponent(studentId)}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Identity card download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${studentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-id-card.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState({ kind: "done", message: "Identity card downloaded." });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Download failed." });
    }
  }

  return (
    <div className="product-print-actions" aria-live="polite">
      <button type="button" className="button secondary" onClick={downloadIdCard} disabled={state.kind === "working"} aria-busy={state.kind === "working"}>
        {state.kind === "working" ? "Preparing PDF…" : "Print ID card"}
      </button>
      {state.kind === "error" ? <p className="product-field-error" role="alert">{state.message}</p> : null}
      {state.kind === "done" ? <p className="product-success-note" role="status">{state.message}</p> : null}
    </div>
  );
}
