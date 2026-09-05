"use client";

import { useState } from "react";

export function StudentPrintActions({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [state, setState] = useState<{ kind: "idle" | "working" | "error" | "done"; message?: string }>({ kind: "idle" });

  async function downloadIdCard() {
    setState({ kind: "working" });
    try {
      const listRes = await fetch("/api/school/identity-cards", { cache: "no-store" });
      const listJson = await listRes.json().catch(() => ({}));
      if (!listRes.ok || !listJson.ok) throw new Error(listJson.message || "Identity cards could not be loaded.");
      const card = (listJson.cards ?? []).find((c: { studentId?: string }) => c.studentId === studentId);
      if (!card) throw new Error("No active identity card exists for this learner yet. Issue cards from School ID cards first.");
      const res = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "download", scope: "selected", ids: [card.id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Identity card download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${studentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-id-card.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
