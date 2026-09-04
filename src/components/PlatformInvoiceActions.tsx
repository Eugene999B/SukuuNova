"use client";

import { useMemo, useState } from "react";
import { Calculator, FilePlus2 } from "lucide-react";

type School = { id: string; name: string; uniqueCode: string };

export default function PlatformInvoiceActions({ schools }: { schools: School[] }) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? ""), [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7)), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<{ amount: number; calculation?: { billingMode?: string; activeStudents?: number; studentRate?: number | null; baseAmount?: number; finalAmount?: number; currency?: string } } | null>(null);
  const school = useMemo(() => schools.find((item) => item.id === schoolId), [schools, schoolId]);
  const generate = async () => {
    if (!schoolId || !period) { setMessage("Choose a school and billing period."); return; }
    setBusy(true); setMessage(""); setResult(null);
    try {
      const response = await fetch("/api/platform/control-plane", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generateInvoice", schoolId, period }) });
      const data = await response.json() as { message?: string; error?: string; invoice?: { amount: number; calculation?: PlatformInvoiceActionsPropsCalculation; existing?: boolean } };
      if (!response.ok) { setMessage(data.message ?? data.error ?? "Invoice generation failed."); return; }
      setResult(data.invoice ?? null);
      setMessage(data.invoice?.existing ? "An invoice for that period already exists; no duplicate was created." : "Invoice generated from the configured billing rule.");
    } finally { setBusy(false); }
  };
  return <section className="app-card app-panel" style={{ padding: 22, marginTop: 18 }}>
    <div className="app-card-head"><div><span className="app-eyebrow">INVOICE ENGINE</span><h2>Generate from configured pricing</h2><p>Generate a school invoice using its flat-rate or active-student pricing rule and store the calculation basis with the invoice.</p></div><Calculator size={20}/></div>
    <div className="platform-form-grid"><label><span>School</span><select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">Choose a school…</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.uniqueCode}</option>)}</select></label><label><span>Billing period</span><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label></div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, padding: 13, border: "1px solid var(--sn-line)", borderRadius: 12, background: "#fbfcfe" }}><div style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 11 }}>Selected account</strong><span style={{ fontSize: 10, color: "var(--sn-muted)" }}>{school ? `${school.name} · ${school.uniqueCode}` : "No school selected"}</span></div><button type="button" className="app-action" onClick={() => void generate()} disabled={busy || !schoolId}><FilePlus2 size={14}/><strong>{busy ? "Generating…" : "Generate invoice"}</strong></button></div>
    {message && <div className="app-banner" role="status" style={{ marginTop: 12 }}><div><h3>{message}</h3><p>The calculation is auditable and uses the school’s current configured pricing.</p></div></div>}
    {result && <div className="platform-calculation-card" style={{ marginBottom: 0 }}><div><span className="platform-calculation-label">Invoice amount</span><strong>{result.calculation?.currency === "GHS" || !result.calculation?.currency ? "₵" : result.calculation.currency + " "}{Number(result.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong><small>{result.calculation?.billingMode === "per_student" ? `${Number(result.calculation.activeStudents ?? 0).toLocaleString()} active students × ₵${Number(result.calculation.studentRate ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "Flat-rate subscription"}</small></div><Calculator size={22}/></div>}
  </section>;
}

type PlatformInvoiceActionsPropsCalculation = { billingMode?: string; activeStudents?: number; studentRate?: number | null; baseAmount?: number; finalAmount?: number; currency?: string };
