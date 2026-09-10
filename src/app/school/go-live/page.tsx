import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleGauge, ShieldCheck, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolGoLiveReadiness } from "@/lib/go-live-readiness";
import "./go-live.css";

const STATUS_COPY = {
  complete: { label: "Ready", icon: CheckCircle2 },
  attention: { label: "Needs attention", icon: Wrench },
  blocked: { label: "Blocker", icon: AlertTriangle },
} as const;

export default async function SchoolGoLivePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, readiness] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolGoLiveReadiness(tx, session.schoolId),
    ]);
    if (!school) throw new Error("School not found.");
    return { school, readiness };
  });

  const ordered = [...data.readiness.steps].sort((a, b) => {
    const rank = { blocked: 0, attention: 1, complete: 2 } as const;
    return rank[a.status] - rank[b.status] || b.weight - a.weight;
  });

  return (
    <AppShell
      universe="school"
      title="Go-Live Readiness"
      subtitle="Finish the operational setup SukuuNova needs before wider school rollout."
      active="Go-Live Readiness"
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      userName={session.name}
    >
      <div className="go-live-page">
        <section className="go-live-command">
          <div>
            <span className="app-eyebrow">SCHOOL ONBOARDING</span>
            <h2>{data.readiness.readyToLaunch ? "Ready for launch review" : "What still blocks rollout?"}</h2>
            <p>{data.readiness.readyToLaunch ? "Core setup checks are complete. Run the final pilot/certification checks before opening wider access." : "Work through blockers first, then clear the remaining attention items. The score is calculated from live school data, not manual checkboxes."}</p>
          </div>
          <div className={`go-live-score ${data.readiness.readyToLaunch ? "is-ready" : data.readiness.blockerCount ? "is-blocked" : "is-watch"}`}>
            <CircleGauge size={18} />
            <div><small>Readiness</small><strong>{data.readiness.score}%</strong></div>
          </div>
        </section>

        <section className="go-live-kpis" aria-label="Go-live summary">
          <div><span><AlertTriangle size={15}/></span><div><small>Blockers</small><strong>{data.readiness.blockerCount}</strong></div></div>
          <div><span><Wrench size={15}/></span><div><small>Needs attention</small><strong>{data.readiness.attentionCount}</strong></div></div>
          <div><span><CheckCircle2 size={15}/></span><div><small>Ready steps</small><strong>{data.readiness.steps.filter((step) => step.status === "complete").length}</strong></div></div>
          <div><span><ShieldCheck size={15}/></span><div><small>Launch gate</small><strong>{data.readiness.readyToLaunch ? "Review ready" : "Hold"}</strong></div></div>
        </section>

        <section className="app-card app-panel go-live-worklist">
          <div className="app-card-head">
            <div>
              <span className="app-eyebrow">NEXT WORK</span>
              <h2>Setup worklist</h2>
              <p>Highest-risk incomplete work appears first. Each item links to the place where it can be fixed.</p>
            </div>
          </div>

          <div className="go-live-list">
            {ordered.map((item) => {
              const Icon = STATUS_COPY[item.status].icon;
              return <article className={`go-live-row is-${item.status}`} key={item.key}>
                <div className="go-live-status"><Icon size={16}/><span>{STATUS_COPY[item.status].label}</span></div>
                <div className="go-live-copy"><strong>{item.title}</strong><p>{item.description}</p><small>{item.detail}</small></div>
                <div className="go-live-weight"><span>Weight</span><strong>{item.weight}%</strong><small>{Math.round(item.score * 10) / 10} earned</small></div>
                <div><Link href={item.href} className="app-action"><strong>{item.actionLabel}</strong></Link></div>
              </article>;
            })}
          </div>
        </section>

        <details className="sn-progressive go-live-more">
          <summary>How the readiness score works</summary>
          <div className="sn-progressive-body go-live-explain">
            <p>The score is weighted toward operational dependencies: academic period, staff access, teaching connections, learner/class coverage and guardian coverage. Branding, fees and communication configuration still matter, but they do not outweigh missing core school structure.</p>
            <p>A score of 90% or more is not enough by itself. SukuuNova only marks the school review-ready when no hard blocker remains. Final pilot/device/provider certification is still a separate launch gate.</p>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
