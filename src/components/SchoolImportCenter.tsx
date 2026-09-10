"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import "@/components/school-import-center.css";

type ImportKind = "students" | "guardians" | "staff" | "classes" | "subjects" | "opening_balances";
type FieldDefinition = { key: string; label: string; type: string; required: boolean; aliases: string[]; description: string };
type Contract = { kind: ImportKind; label: string; description: string; fields: FieldDefinition[] };
type Batch = {
  id: string; kind: ImportKind; status: string; sourceFileName: string; sourceSha256: string;
  originalHeaders: string[]; normalizedHeaders: string[]; columnMapping: Record<string, string | null>;
  rowCount: number; validRows: number; invalidRows: number; duplicateRows: number; createdAt: string; validatedAt: string | null;
};
type Row = {
  id?: string; rowNumber: number; status: string; rawData?: Record<string, unknown>; raw?: Record<string, string>;
  normalizedData?: Record<string, unknown>; normalized?: Record<string, unknown>;
  validationErrors?: Array<{ field: string | null; code: string; message: string }>;
  issues?: Array<{ field: string | null; code: string; message: string }>;
};
type OverviewPayload = {
  batches: Batch[];
  access: Record<ImportKind, boolean>;
  contracts: Partial<Record<ImportKind, Contract>>;
  applyEnabledKinds: ImportKind[];
};
type BatchPayload = { batch: Batch; rows: Row[]; access?: Record<ImportKind, boolean>; applyEnabledKinds?: ImportKind[] };

function statusLabel(status: string) {
  if (status === "ready") return "Ready to apply";
  if (status === "validated") return "Needs corrections";
  if (status === "uploaded" || status === "mapped") return "Needs validation";
  if (status === "applied") return "Applied";
  return status.replace(/_/g, " ");
}

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.message === "string" ? row.message : typeof row.error === "string" ? row.error : fallback;
}

export default function SchoolImportCenter() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [batchView, setBatchView] = useState<BatchPayload | null>(null);
  const [kind, setKind] = useState<ImportKind>("students");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOverview = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/school/import", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload, "Could not load the import center."));
      const data = payload as OverviewPayload;
      setOverview(data);
      const allowed = (Object.keys(data.contracts) as ImportKind[]).find((key) => data.access[key]);
      if (allowed) setKind((current) => data.access[current] ? current : allowed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the import center.");
    } finally { setBusy(false); }
  }, []);

  const loadBatch = useCallback(async (batchId: string) => {
    setBusy(true); setError(""); setApplyConfirmed(false);
    try {
      const response = await fetch(`/api/school/import?batchId=${encodeURIComponent(batchId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload, "Could not load the import batch."));
      const data = payload as BatchPayload;
      setBatchView(data);
      setKind(data.batch.kind);
      setMapping(data.batch.columnMapping ?? {});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the import batch.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const contract = overview?.contracts[kind] ?? null;
  const selectedBatch = batchView?.batch ?? null;
  const previewRows = useMemo(() => (batchView?.rows ?? []).slice(0, 100), [batchView]);
  const applyEnabledKinds = overview?.applyEnabledKinds ?? batchView?.applyEnabledKinds ?? [];
  const applyEnabled = selectedBatch ? applyEnabledKinds.includes(selectedBatch.kind) : false;

  async function upload() {
    if (!file || !contract) { setError("Choose a CSV file and import type first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("action", "upload"); form.set("kind", kind); form.set("file", file);
      const response = await fetch("/api/school/import", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload, "CSV upload failed."));
      const batch = (payload as { batch: Batch }).batch;
      setFile(null);
      await loadOverview();
      await loadBatch(batch.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV upload failed.");
    } finally { setBusy(false); }
  }

  async function validate() {
    if (!selectedBatch) return;
    setBusy(true); setError(""); setNotice(""); setApplyConfirmed(false);
    try {
      const response = await fetch("/api/school/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", batchId: selectedBatch.id, columnMapping: mapping }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload, "Import validation failed."));
      const data = payload as { batch: Batch; rows: Row[] };
      setBatchView({ batch: data.batch, rows: data.rows });
      setMapping(data.batch.columnMapping);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import validation failed.");
    } finally { setBusy(false); }
  }

  async function applyBatch() {
    if (!selectedBatch || !applyEnabled || !applyConfirmed || selectedBatch.status !== "ready") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/school/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", batchId: selectedBatch.id, confirmation: "APPLY" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload, "Import apply failed and was rolled back."));
      const result = payload as { appliedRows?: number; alreadyApplied?: boolean };
      setNotice(result.alreadyApplied ? "This batch had already been applied. No records were written twice." : `${result.appliedRows ?? selectedBatch.rowCount} rows were applied atomically to the school.`);
      setApplyConfirmed(false);
      await loadOverview();
      await loadBatch(selectedBatch.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import apply failed and was rolled back.");
    } finally { setBusy(false); }
  }

  return <div className="school-import-center">
    <section className="import-command">
      <div><span className="app-eyebrow">DATA MIGRATION</span><h2>Bring school data into SukuuNova safely</h2><p>Upload into staging, map columns, validate every row, review exceptions, then apply only through SukuuNova&apos;s certified all-or-nothing writer.</p></div>
      <span className="import-safety"><ShieldCheck size={16}/> Transactional import</span>
    </section>

    {error ? <div className="import-error" role="alert"><AlertTriangle size={15}/><span>{error}</span></div> : null}
    {notice ? <div className="import-notice" role="status"><CheckCircle2 size={15}/><span>{notice}</span></div> : null}

    <div className="import-layout">
      <section className="app-card app-panel import-upload-panel">
        <div className="app-card-head"><div><span className="app-eyebrow">1 · UPLOAD</span><h2>Start an import batch</h2><p>CSV is supported in this certified foundation. Excel will use the same staging contract after its parser dependency is verified.</p></div></div>
        <label className="import-field"><span>Data type</span><select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); setBatchView(null); setApplyConfirmed(false); }} disabled={busy}>
          {(Object.entries(overview?.contracts ?? {}) as Array<[ImportKind, Contract]>).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select></label>
        {contract ? <p className="import-contract-copy">{contract.description}</p> : null}
        <label className="import-file-drop"><FileSpreadsheet size={22}/><strong>{file?.name ?? "Choose CSV file"}</strong><small>Maximum 5 MB · up to 5,000 data rows</small><input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy}/></label>
        <button type="button" className="app-action" onClick={() => void upload()} disabled={busy || !file || !contract}><Upload size={14}/><strong>Upload to staging</strong></button>
      </section>

      <section className="app-card app-panel import-history-panel">
        <div className="app-card-head"><div><span className="app-eyebrow">RECENT</span><h2>Import batches</h2></div><button type="button" className="app-pill" onClick={() => void loadOverview()} disabled={busy}><RefreshCw size={13}/> Refresh</button></div>
        <div className="import-history-list">
          {(overview?.batches ?? []).map((batch) => <button type="button" className={`import-history-row ${selectedBatch?.id === batch.id ? "is-selected" : ""}`} onClick={() => void loadBatch(batch.id)} key={batch.id}>
            <div><b>{overview?.contracts[batch.kind]?.label ?? batch.kind}</b><small>{batch.sourceFileName}</small></div><div><strong>{batch.rowCount}</strong><small>rows</small></div><span className={`import-status import-status-${batch.status}`}>{statusLabel(batch.status)}</span>
          </button>)}
          {!busy && overview && overview.batches.length === 0 ? <div className="platform-empty"><strong>No import batches yet.</strong><span>Upload a CSV to create the first staging batch.</span></div> : null}
        </div>
      </section>
    </div>

    {selectedBatch && contract ? <section className="app-card app-panel import-map-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">2 · MAP & VALIDATE</span><h2>{selectedBatch.sourceFileName}</h2><p>Confirm which CSV column belongs to each SukuuNova field. Required fields must be mapped before validation.</p></div><span className={`import-status import-status-${selectedBatch.status}`}>{statusLabel(selectedBatch.status)}</span></div>
      <div className="import-mapping-grid">
        {contract.fields.map((field) => <label className="import-map-row" key={field.key}>
          <div><strong>{field.label}{field.required ? " *" : ""}</strong><small>{field.description}</small></div>
          <select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value || null }))} disabled={busy || selectedBatch.status === "applied"}>
            <option value="">Do not import</option>
            {selectedBatch.normalizedHeaders.map((header, index) => <option value={header} key={header}>{selectedBatch.originalHeaders[index] ?? header}</option>)}
          </select>
        </label>)}
      </div>
      <div className="import-validation-actions"><button type="button" className="app-action" onClick={() => void validate()} disabled={busy || selectedBatch.status === "applied"}><CheckCircle2 size={14}/><strong>Validate all rows</strong></button><small>Validation checks field formats, duplicates inside the file, existing school records and referenced learners/classes.</small></div>
    </section> : null}

    {selectedBatch && batchView ? <section className="app-card app-panel import-preview-panel">
      <div className="app-card-head"><div><span className="app-eyebrow">3 · REVIEW & APPLY</span><h2>Validation preview</h2><p>Resolve every invalid or duplicate row before the batch can become ready for transactional apply.</p></div><a className="app-pill import-report-link" href={`/api/school/import/errors?batchId=${encodeURIComponent(selectedBatch.id)}`}><Download size={13}/> Download validation report</a></div>
      <div className="import-kpis">
        <div><small>Total rows</small><strong>{selectedBatch.rowCount}</strong></div>
        <div><small>Valid</small><strong>{selectedBatch.validRows}</strong></div>
        <div><small>Invalid</small><strong>{selectedBatch.invalidRows}</strong></div>
        <div><small>Duplicates</small><strong>{selectedBatch.duplicateRows}</strong></div>
      </div>
      <div className="import-preview-list">
        {previewRows.map((row) => {
          const errors = row.issues ?? row.validationErrors ?? [];
          const data = row.normalized ?? row.normalizedData ?? row.raw ?? row.rawData ?? {};
          return <article className={`import-preview-row is-${row.status}`} key={`${row.id ?? "row"}-${row.rowNumber}`}>
            <div><strong>Row {row.rowNumber}</strong><span className={`import-status import-status-${row.status}`}>{row.status}</span></div>
            <p>{Object.entries(data).filter(([, value]) => value != null && String(value).trim() !== "").slice(0, 5).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "No mapped values yet"}</p>
            {errors.length ? <ul>{errors.slice(0, 4).map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul> : <small>No validation issue detected.</small>}
          </article>;
        })}
        {batchView.rows.length > 100 ? <div className="import-preview-limit">Showing the first 100 of {batchView.rows.length} rows.</div> : null}
      </div>

      {selectedBatch.status === "applied" ? <div className="import-apply-success"><CheckCircle2 size={17}/><div><strong>Batch applied</strong><p>This batch is locked as applied. Reopening it will not write the records again.</p></div></div>
        : !applyEnabled ? <div className="import-apply-lock"><ShieldCheck size={16}/><div><strong>Production apply remains locked for this data type</strong><p>Staff credentials and opening balances require their dedicated certified writers. You can still stage, map, validate and export correction reports safely.</p></div></div>
        : selectedBatch.status !== "ready" ? <div className="import-apply-lock"><ShieldCheck size={16}/><div><strong>Apply is waiting for a clean validation</strong><p>Every source row must be valid and non-duplicate. Correct the CSV or mapping, then validate again.</p></div></div>
        : <div className="import-apply-ready">
          <div><ShieldCheck size={17}/><div><strong>Ready for atomic apply</strong><p>SukuuNova will revalidate inside the same transaction before writing. If any row fails, the entire batch rolls back.</p></div></div>
          <label className="import-confirm"><input type="checkbox" checked={applyConfirmed} onChange={(event) => setApplyConfirmed(event.target.checked)} disabled={busy}/><span>I confirm that I reviewed this batch and want to write all {selectedBatch.rowCount} rows to the school.</span></label>
          <button type="button" className="app-action" disabled={busy || !applyConfirmed} onClick={() => void applyBatch()}><ShieldCheck size={14}/><strong>Apply {selectedBatch.rowCount} rows</strong></button>
        </div>}
    </section> : null}
  </div>;
}
