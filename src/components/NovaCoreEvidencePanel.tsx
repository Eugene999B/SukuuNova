"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, School, ShieldCheck } from "lucide-react";
import "@/components/novacore-control.css";

type SchoolOption = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  studentCount: number;
};

type EvidenceRow = {
  algorithmKey: string;
  algorithmVersion: string;
  domain: string;
  rolloutMode: string;
  samples: number;
  averageConfidence: number | null;
  averageLatencyMs: number | null;
  firstObservedAt: string;
  lastObservedAt: string;
  topReasonCodes: Array<{ reasonCode: string; count: number }>;
};

type EtaAccuracy = {
  algorithmVersion: string;
  samples: number;
  maeMinutes: number | null;
  medianErrorMinutes: number | null;
  p90ErrorMinutes: number | null;
  within2MinutesRate: number | null;
  within5MinutesRate: number | null;
  withinConfidenceRate: number | null;
};

type EtaPromotion = {
  policyVersion: string;
  status: "insufficient_evidence" | "hold" | "review_ready";
  automaticPromotionAllowed: false;
  passedGates: string[];
  failedGates: string[];
  remainingSamples: number;
};

type EvidenceSummary = {
  schoolId: string;
  days: number;
  generatedAt: string;
  algorithms: EvidenceRow[];
  etaAccuracy: EtaAccuracy;
  etaPromotion: EtaPromotion;
};

function title(value: string) {
  return value
    .replace(/^[^.]+\./, "")
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function confidence(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function rate(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function etaVerdict(status: EtaPromotion["status"]) {
  if (status === "review_ready") return "Review ready";
  if (status === "hold") return "Hold in shadow";
  return "Collecting evidence";
}

export default function NovaCoreEvidencePanel() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedSchool = useMemo(() => schools.find((school) => school.id === schoolId) ?? null, [schools, schoolId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/platform/control-plane?view=schools", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not load schools.");
        const rows = Array.isArray(payload.schools) ? payload.schools as SchoolOption[] : [];
        if (!active) return;
        setSchools(rows);
        setSchoolId((current) => current || rows[0]?.id || "");
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load schools."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const loadEvidence = useCallback(async () => {
    if (!schoolId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/novacore?view=summary&schoolId=${encodeURIComponent(schoolId)}&days=${days}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load NovaCore evidence.");
      setSummary(payload as EvidenceSummary);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load NovaCore evidence.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [days, schoolId]);

  useEffect(() => { void loadEvidence(); }, [loadEvidence]);

  const sampleTotal = summary?.algorithms.reduce((sum, row) => sum + row.samples, 0) ?? 0;
  const observedAlgorithms = summary?.algorithms.length ?? 0;
  const shadowSamples = summary?.algorithms.filter((row) => row.rolloutMode === "shadow").reduce((sum, row) => sum + row.samples, 0) ?? 0;

  return <section className="app-card app-panel novacore-evidence-panel">
    <div className="app-card-head novacore-evidence-head">
      <div>
        <span className="app-eyebrow">LIVE EVIDENCE</span>
        <h2>School algorithm evidence</h2>
        <p>Inspect what NovaCore actually observed before changing any rollout decision.</p>
      </div>
      <button type="button" className="app-pill" onClick={() => void loadEvidence()} disabled={loading || !schoolId}><RefreshCw size={13}/> Refresh</button>
    </div>

    <div className="novacore-evidence-controls">
      <label><span>School</span><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} disabled={loading && schools.length === 0}>
        {schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.uniqueCode}</option>)}
      </select></label>
      <label><span>Evidence window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>
        <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option>
      </select></label>
      <div className="novacore-school-context"><School size={14}/><span>{selectedSchool ? `${selectedSchool.studentCount.toLocaleString()} learners · ${selectedSchool.status}` : "Choose a school"}</span></div>
    </div>

    {error ? <div className="novacore-evidence-error" role="alert">{error}</div> : null}

    <div className="novacore-evidence-kpis" aria-label="NovaCore evidence summary">
      <div><span><Activity size={15}/></span><div><small>Decision samples</small><strong>{sampleTotal.toLocaleString()}</strong></div></div>
      <div><span><ShieldCheck size={15}/></span><div><small>Algorithms observed</small><strong>{observedAlgorithms}</strong></div></div>
      <div><span><Activity size={15}/></span><div><small>Shadow samples</small><strong>{shadowSamples.toLocaleString()}</strong></div></div>
    </div>

    {summary ? <section className={`novacore-eta-cert novacore-eta-${summary.etaPromotion.status}`} aria-label="ETA shadow certification">
      <div className="novacore-eta-verdict"><span><ShieldCheck size={16}/></span><div><small>ETA shadow certification</small><strong>{etaVerdict(summary.etaPromotion.status)}</strong><em>v{summary.etaAccuracy.algorithmVersion} · policy {summary.etaPromotion.policyVersion}</em></div></div>
      <div><small>Evaluated predictions</small><strong>{summary.etaAccuracy.samples.toLocaleString()}</strong><em>{summary.etaPromotion.remainingSamples ? `${summary.etaPromotion.remainingSamples} more for review gate` : "Sample gate met"}</em></div>
      <div><small>Mean error</small><strong>{summary.etaAccuracy.maeMinutes == null ? "—" : `${summary.etaAccuracy.maeMinutes} min`}</strong><em>Median {summary.etaAccuracy.medianErrorMinutes == null ? "—" : `${summary.etaAccuracy.medianErrorMinutes} min`}</em></div>
      <div><small>P90 error</small><strong>{summary.etaAccuracy.p90ErrorMinutes == null ? "—" : `${summary.etaAccuracy.p90ErrorMinutes} min`}</strong><em>Within 5 min {rate(summary.etaAccuracy.within5MinutesRate)}</em></div>
      <div><small>Confidence coverage</small><strong>{rate(summary.etaAccuracy.withinConfidenceRate)}</strong><em>Automatic promotion disabled</em></div>
    </section> : null}

    <div className="novacore-evidence-list">
      <div className="novacore-evidence-row novacore-evidence-row-head"><span>Algorithm</span><span>Mode</span><span>Samples</span><span>Confidence</span><span>Latency</span><span>Top evidence</span></div>
      {summary?.algorithms.map((row) => <div className="novacore-evidence-row" key={`${row.algorithmKey}@${row.algorithmVersion}`}>
        <div><b>{title(row.algorithmKey)}</b><small>{row.algorithmKey} · v{row.algorithmVersion}</small></div>
        <span className={`novacore-mode novacore-mode-${row.rolloutMode}`}>{row.rolloutMode}</span>
        <strong>{row.samples.toLocaleString()}</strong>
        <span>{confidence(row.averageConfidence)}</span>
        <span>{row.averageLatencyMs == null ? "—" : `${row.averageLatencyMs} ms`}</span>
        <div className="novacore-reasons">{row.topReasonCodes.length ? row.topReasonCodes.slice(0, 3).map((reason) => <span key={reason.reasonCode}>{title(reason.reasonCode)} · {reason.count}</span>) : <small>No reason codes yet</small>}</div>
      </div>)}
      {!loading && summary && summary.algorithms.length === 0 ? <div className="platform-empty novacore-empty"><strong>No NovaCore decisions in this window yet.</strong><span>Evidence will appear as instrumented algorithms run for this school.</span></div> : null}
      {loading ? <div className="platform-empty novacore-empty"><strong>Loading algorithm evidence…</strong></div> : null}
    </div>
  </section>;
}
