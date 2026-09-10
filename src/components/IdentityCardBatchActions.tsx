"use client";

import { useState } from "react";
import { Download, IdCard } from "lucide-react";

type Props = {
  mode: "students" | "staff";
  classes?: Array<{ id: string; name: string }>;
};

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export function IdentityCardBatchActions({ mode, classes = [] }: Props) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function download(scope: "students" | "staff" | "class") {
    setBusy(scope);
    setMessage("");
    try {
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "download", scope, ...(scope === "class" ? { classId } : {}) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(payload?.message || payload?.error || "Could not generate the ID-card pack.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(response.headers.get("content-disposition"), `${mode}-identity-cards.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("ID-card PDF generated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the ID-card pack.");
    } finally {
      setBusy("");
    }
  }

  return <div className="identity-batch-actions">
    <button type="button" className="button secondary" onClick={() => void download(mode)} disabled={Boolean(busy)}>
      <Download size={15}/> {busy === mode ? "Preparing…" : `Download all ${mode === "students" ? "student" : "staff"} IDs`}
    </button>
    {mode === "students" && classes.length ? <div className="identity-class-download">
      <label><span>Class ID pack</span><select value={classId} onChange={(event) => setClassId(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="button secondary" onClick={() => void download("class")} disabled={Boolean(busy) || !classId}><IdCard size={15}/> {busy === "class" ? "Preparing…" : "Download class IDs"}</button>
    </div> : null}
    {message ? <small role="status" className="identity-batch-message">{message}</small> : null}
  </div>;
}
