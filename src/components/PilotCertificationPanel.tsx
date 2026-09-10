"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleGauge, Eye, RefreshCw, ShieldCheck } from "lucide-react";

type SchoolOption = { id: string; name: string; uniqueCode: string; status: string; studentCount: number };
type Evidence = {
  id: string; status: string; environment: string; evidenceSummary: string; evidenceRef: string | null;
  commitSha: string | null; ciRun: string | null; expiresAt: string | null; reviewedByName: string; reviewedAt: string;
};
type EnvironmentEvidence = { environment: string; state: string; evidence: Evidence | null };
type Check = {
  key: string; title: string; domain: string; requiredForPilot: boolean; allowWaiver: boolean; evidenceMode: string;
  requiredEnvironments: string[]; description: string; state: string; evidence: Evidence | null; environmentEvidence: EnvironmentEvidence[];
};
type Overview = {
  school: { id: string; name: string; uniqueCode: string; status: string };
  checks: Check[];
  summary: { required: number; passedRequired: number; failedRequired: number; pendingRequired: number; progressPercent: number; pilotReady: boolean; controlledPassed: number; controlledWaived: number; controlledAttention: number };
};
type HistoryPayload = { rows: Evidence[] };
type Props = { canReview: boolean };

function messageOf(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.message === "string" ? row.message : typeof row.error === "string" ? row.error : fallback;
}

function stateLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function when(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(date) : value;
}

function stateRank(value: string) {
  if (["failed", "expired", "wrong_environment"].includes(value)) return 0;
  if (["partial", "in_review", "not_tested"].includes(value)) return 1;
  if (value === "waived") return 2;
  return 3;
}

export default function PilotCertificationPanel({ canReview }: Props) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [history, setHistory] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("in_review");
  const [environment, setEnvironment] = useState("production");
  const [summary, setSummary] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [ciRun, setCiRun] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/platform/control-plane?view=schools", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(messageOf(payload, "Could not load schools."));
        const rows = Array.isArray(payload.schools) ? payload.schools as SchoolOption[] : [];
        if (!active) return;
        setSchools(rows);
        setSchoolId(rows[0]?.id ?? "");
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load schools."));
    return () => { active = false; };
  }, []);

  const loadOverview = useCallback(async () => {
    if (!schoolId) {
      setOverview(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/certification?schoolId=${encodeURIComponent(schoolId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not load certification evidence."));
      const data = payload as Overview;
      setOverview(data);
      setSelectedKey((current) => {
        if (current && data.checks.some((check) => check.key === current)) return current;
        const required = data.checks.filter((check) => check.requiredForPilot).sort((a, b) => stateRank(a.state) - stateRank(b.state));
        return required[0]?.key ?? data.checks[0]?.key ?? "";
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load certification evidence.");
      setOverview(null);
    } finally {
      setBusy(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const selectedCheck = useMemo(() => overview?.checks.find((check) => check.key === selectedKey) ?? null, [overview, selectedKey]);

  const loadHistory = useCallback(async () => {
    if (!schoolId || !selectedKey) {
      setHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/platform/certification?view=history&schoolId=${encodeURIComponent(schoolId)}&checkKey=${encodeURIComponent(selectedKey)}&limit=25`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not load certification history."));
      setHistory((payload as HistoryPayload).rows ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load certification history.");
    }
  }, [schoolId, selectedKey]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!selectedCheck) return;
    setEnvironment(selectedCheck.requiredEnvironments[0] ?? "production");
    setStatus("in_review");
    setSummary("");
    setEvidenceRef("");
    setCommitSha("");
    setCiRun("");
    setExpiresAt("");
  }, [selectedCheck]);

  async function recordEvidence() {
    if (!selectedCheck || !summary.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recordEvidence",
          schoolId,
          checkKey: selectedCheck.key,
          status,
          environment,
          evidenceSummary: summary,
          evidenceRef: evidenceRef.trim() || null,
          commitSha: commitSha.trim() || null,
          ciRun: ciRun.trim() || null,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString() : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageOf(payload, "Could not record certification evidence."));
      setSummary("");
      setEvidenceRef("");
      setCommitSha("");
      setCiRun("");
      setExpiresAt("");
      await Promise.all([loadOverview(), loadHistory()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record certification evidence.");
    } finally {
      setBusy(false);
    }
  }

  const requiredChecks = useMemo(() => [...(overview?.checks.filter((check) => check.requiredForPilot) ?? [])].sort((a, b) => stateRank(a.state) - stateRank(b.state)), [overview]);
  const controlledChecks = useMemo(() => overview?.checks.filter((check) => !check.requiredForPilot) ?? [], [overview]);
  const selectedSchool = schools.find((school) => school.id === schoolId) ?? null;

  return <div className="pilot-certification">
    <section className="cert-command">
      <div><span className="platform-eyebrow">Launch control</span><h2>{!selectedSchool ? "Choose a school to begin pilot certification" : overview?.summary.pilotReady ? "This school has cleared the recorded pilot gates" : "What still prevents pilot sign-off?"}</h2><p>Certification is evidence-based. CI, live deployment, provider, hardware and recovery proof stay separate so a mocked success cannot be mistaken for production readiness.</p></div>
      <div className={`cert-score ${overview?.summary.pilotReady ? "is-ready" : "is-hold"}`}><CircleGauge size={20}/><div><small>Required gate progress</small><strong>{overview?.summary.progressPercent ?? 0}%</strong></div></div>
    </section>

    <section className="app-card app-panel cert-school-select">
      <label><span>Certification school</span><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} disabled={busy}><option value="">Choose a school…</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.uniqueCode}</option>)}</select></label>
      <button className="app-pill" type="button" onClick={() => void loadOverview()} disabled={busy || !schoolId}><RefreshCw size={14}/> {busy ? "Refreshing…" : "Refresh evidence"}</button>
    </section>

    {error ? <div className="cert-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div> : null}

    <section className="cert-kpis">
      <div><span><CheckCircle2 size={17}/></span><div><small>Required passed</small><strong>{overview?.summary.passedRequired ?? 0}/{overview?.summary.required ?? 0}</strong></div></div>
      <div><span><AlertTriangle size={17}/></span><div><small>Required failed</small><strong>{overview?.summary.failedRequired ?? 0}</strong></div></div>
      <div><span><Eye size={17}/></span><div><small>Required pending</small><strong>{overview?.summary.pendingRequired ?? 0}</strong></div></div>
      <div><span><ShieldCheck size={17}/></span><div><small>Controlled waived</small><strong>{overview?.summary.controlledWaived ?? 0}</strong></div></div>
    </section>

    <div className="cert-layout">
      <section className="cert-checks">
        <div className="app-card-head"><div><span className="app-eyebrow">Required gates</span><h2>Pilot launch gates</h2><p>Blocking or unfinished gates appear first. Every required environment for a gate must hold current evidence.</p></div></div>
        <div className="cert-check-list">
          {requiredChecks.map((check) => <button key={check.key} type="button" className={`cert-check ${selectedKey === check.key ? "is-selected" : ""}`} onClick={() => setSelectedKey(check.key)}>
            <div><strong>{check.title}</strong><small>{check.domain}</small></div><span className={`cert-state is-${check.state}`}>{stateLabel(check.state)}</span>
            <p>{check.description}</p><div className="cert-envs">{check.environmentEvidence.map((item) => <span key={item.environment} className={`is-${item.state}`}>{item.environment}: {stateLabel(item.state)}</span>)}</div>
          </button>)}
          {schoolId && !requiredChecks.length ? <div className="platform-empty"><strong>No required certification gates are configured.</strong></div> : null}
          {!schoolId ? <div className="platform-empty"><strong>Choose a school to load its launch gates.</strong></div> : null}
        </div>
        {controlledChecks.length ? <details className="sn-progressive"><summary>Controlled-beta gates · {controlledChecks.length}</summary><div className="sn-progressive-body cert-check-list">{controlledChecks.map((check) => <button key={check.key} type="button" className={`cert-check ${selectedKey === check.key ? "is-selected" : ""}`} onClick={() => setSelectedKey(check.key)}><div><strong>{check.title}</strong><small>{check.domain}</small></div><span className={`cert-state is-${check.state}`}>{stateLabel(check.state)}</span><p>{check.description}</p></button>)}</div></details> : null}
      </section>

      <section className="cert-review">
        <div className="app-card-head"><div><span className="app-eyebrow">Evidence review</span><h2>{selectedCheck?.title ?? "Choose a gate"}</h2><p>{selectedCheck?.description ?? "Select a certification gate to inspect current state and append review evidence."}</p></div></div>
        {selectedCheck ? <>
          <div className="cert-current"><small>Current state</small><strong>{stateLabel(selectedCheck.state)}</strong><span>Required evidence: {selectedCheck.requiredEnvironments.join(" + ") || "Controlled evidence"}</span></div>
          {canReview ? <div className="cert-form">
            <div className="cert-form-grid"><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="in_review">In review</option><option value="passed">Passed</option><option value="failed">Failed</option>{selectedCheck.allowWaiver ? <option value="waived">Waived / disabled</option> : null}</select></label><label><span>Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="ci">CI</option><option value="staging">Staging</option><option value="production">Production</option><option value="hardware_lab">Hardware lab</option></select></label><label><span>Expires</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/></label></div>
            <label><span>Evidence summary</span><textarea rows={5} maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What was tested, what result was observed, and what remains? Do not paste credentials or secrets."/></label>
            <div className="cert-form-grid"><label><span>Evidence reference</span><input maxLength={1000} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="Runbook, drill, ticket or provider receipt reference"/></label><label><span>Commit SHA</span><input maxLength={80} value={commitSha} onChange={(event) => setCommitSha(event.target.value)}/></label><label><span>CI run</span><input maxLength={160} value={ciRun} onChange={(event) => setCiRun(event.target.value)}/></label></div>
            <div className="cert-secret-warning"><ShieldCheck size={15}/><span>Never store API keys, access tokens, passwords, database URLs or device secrets in certification evidence.</span></div>
            <button type="button" className="app-action" onClick={() => void recordEvidence()} disabled={busy || !summary.trim()}><strong>Append review evidence</strong></button>
          </div> : <div className="platform-empty"><ShieldCheck size={20}/><strong>Read-only certification access.</strong><span>Platform settings permission is required to append review evidence.</span></div>}

          <div className="cert-history"><div className="module-section-title"><div><span>Append-only history</span><h3>Previous reviews</h3></div></div>{history.map((row) => <article key={row.id}><div><strong>{stateLabel(row.status)} · {row.environment}</strong><small>{when(row.reviewedAt)} · {row.reviewedByName}</small></div><p>{row.evidenceSummary}</p><small>{[row.commitSha ? `commit ${row.commitSha}` : "", row.ciRun ? `CI ${row.ciRun}` : ""].filter(Boolean).join(" · ")}</small></article>)}{!history.length ? <div className="platform-empty"><strong>No review evidence yet.</strong><span>The first appended review will appear here with reviewer and timestamp.</span></div> : null}</div>
        </> : <div className="platform-empty"><Eye size={20}/><strong>No gate selected.</strong><span>Choose a required or controlled gate from the left to inspect its evidence.</span></div>}
      </section>
    </div>
  </div>;
}
