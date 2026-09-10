import { Activity, AlertTriangle, BrainCircuit, Eye, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import NovaCoreEvidencePanel from "@/components/NovaCoreEvidencePanel";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { NOVACORE_ALGORITHMS } from "@/lib/novacore/registry";
import "@/components/platform-owner-control.css";
import "@/components/platform-owner-simple.css";
import "@/components/novacore-control.css";

export default async function NovaCorePage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");

  const enforced = NOVACORE_ALGORITHMS.filter((algorithm) => algorithm.rolloutMode === "enforced").length;
  const shadow = NOVACORE_ALGORITHMS.filter((algorithm) => algorithm.rolloutMode === "shadow").length;
  const highRisk = NOVACORE_ALGORITHMS.filter((algorithm) => algorithm.risk === "high").length;
  const outcome = NOVACORE_ALGORITHMS.filter((algorithm) => algorithm.affectsUserOutcome).length;

  return (
    <AppShell
      universe="platform"
      title="NovaCore"
      subtitle="Algorithm control, evidence, safety and rollout decisions."
      active="NovaCore"
      userName={session.name}
      role={session.role}
    >
      <div className="space-y-4">
        <section className="novacore-command">
          <div>
            <span className="platform-eyebrow">Algorithm control</span>
            <h2>What is NovaCore doing across SukuuNova?</h2>
            <p>Start with rollout posture and real school evidence. Open implementation safeguards only when a version needs inspection or promotion review.</p>
          </div>
        </section>

        <section className="novacore-status-strip" aria-label="NovaCore rollout posture">
          <div className="novacore-status-item"><span><ShieldCheck size={16}/></span><div><small>Enforced</small><strong>{enforced}</strong></div></div>
          <div className="novacore-status-item"><span><Eye size={16}/></span><div><small>Shadow</small><strong>{shadow}</strong></div></div>
          <div className="novacore-status-item"><span><AlertTriangle size={16}/></span><div><small>High risk</small><strong>{highRisk}</strong></div></div>
          <div className="novacore-status-item"><span><Activity size={16}/></span><div><small>Affect outcomes</small><strong>{outcome}</strong></div></div>
        </section>

        {session.role === "super_admin" ? <NovaCoreEvidencePanel/> : <section className="app-card app-panel">
          <div className="app-card-head"><div><span className="app-eyebrow">LIVE EVIDENCE</span><h2>School algorithm evidence</h2></div></div>
          <div className="platform-empty"><ShieldCheck size={20}/><strong>Super Admin access is required for school-level NovaCore evidence.</strong><span>The algorithm registry remains visible below.</span></div>
        </section>}

        <details className="sn-progressive owner-more">
          <summary>More algorithm details</summary>
          <div className="sn-progressive-body">
            <div className="app-card-head">
              <div><span className="app-eyebrow">REGISTRY</span><h2>Versions, rollout and safeguards</h2><p>Every algorithm has one authoritative key, version and rollout mode.</p></div>
            </div>
            <div className="novacore-registry-grid">
              {NOVACORE_ALGORITHMS.map((algorithm) => (
                <article key={algorithm.key} className="novacore-registry-item">
                  <div className="novacore-registry-head">
                    <div>
                      <span className="novacore-registry-meta">{algorithm.domain} · {algorithm.key} · v{algorithm.version}</span>
                      <h3>{algorithm.name}</h3>
                    </div>
                    <span className={`novacore-risk novacore-risk-${algorithm.risk}`}>{algorithm.risk} risk</span>
                  </div>
                  <p>{algorithm.description}</p>
                  <div className="novacore-registry-tags">
                    <span>{algorithm.status}</span>
                    <span>{algorithm.rolloutMode}</span>
                    <span>{algorithm.affectsUserOutcome ? "affects outcome" : "non-authoritative"}</span>
                  </div>
                  <details className="sn-progressive">
                    <summary>Safeguards & evidence</summary>
                    <div className="sn-progressive-body">
                      <div className="novacore-registry-tags">{algorithm.safeguards.map((item) => <span key={item}>{item}</span>)}</div>
                      <div className="novacore-registry-tags">{algorithm.evidence.map((item) => <span key={item}>{item}</span>)}</div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </div>
        </details>

        <details className="sn-progressive owner-more">
          <summary>How NovaCore rollout works</summary>
          <div className="sn-progressive-body owner-explain-grid">
            <div><BrainCircuit size={17}/><b>Versioned decisions</b><p>Every instrumented decision records the authoritative algorithm key and version from the registry.</p></div>
            <div><Eye size={17}/><b>Shadow before promotion</b><p>Candidate algorithms can run without controlling the live school outcome while evidence is collected.</p></div>
            <div><ShieldCheck size={17}/><b>Tenant isolation</b><p>School evidence is queried through the same tenant context and forced row-level security as operational records.</p></div>
            <div><AlertTriangle size={17}/><b>Explainable reasons</b><p>Reason codes show why a decision or fallback occurred instead of presenting a vague AI warning.</p></div>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
