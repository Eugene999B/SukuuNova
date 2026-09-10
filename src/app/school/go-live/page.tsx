import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleGauge, DatabaseZap, LifeBuoy, ShieldCheck, Wrench } from "lucide-react";
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

type StepStatus = keyof typeof STATUS_COPY;

function worstStatus(statuses: StepStatus[]): StepStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("attention")) return "attention";
  return "complete";
}

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
  const byKey = new Map(data.readiness.steps.map((step) => [step.key, step]));
  const phase = (keys: string[]) => worstStatus(keys.map((key) => byKey.get(key)?.status ?? "blocked"));
  const launchPath: Array<{ title: string; description: string; status: StepStatus; href: string; action: string }> = [
    { title: "Foundation", description: "School identity, settings, academic year and current term.", status: phase(["profile", "calendar"]), href: "/school/settings", action: "Set foundation" },
    { title: "Structure", description: "Create the classes and subjects every academic workflow depends on.", status: phase(["classes", "subjects"]), href: "/school/classes", action: "Build structure" },
    { title: "People & data", description: "Prepare staff access, learners and guardian coverage. Existing schools can migrate records in bulk.", status: phase(["staff", "students", "guardians"]), href: "/school/import", action: "Import or review data" },
    { title: "Teaching", description: "Connect teachers to the classes and subjects they actually teach.", status: phase(["teaching"]), href: "/school/academics/setup", action: "Connect teaching" },
    { title: "Operations", description: "Prepare fee structure and at least one parent communication channel.", status: phase(["fees", "communications"]), href: "/school/fees", action: "Prepare operations" },
    { title: "Launch review", description: "Clear every hard blocker, reach the launch threshold and move into pilot certification.", status: data.readiness.readyToLaunch ? "complete" : data.readiness.blockerCount ? "blocked" : "attention", href: "#setup-worklist", action: "Review remaining work" },
  ];

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

        <section className="app-card app-panel go-live-path-panel">
          <div className="app-card-head">
            <div><span className="app-eyebrow">GUIDED SETUP</span><h2>Your launch path</h2><p>Move left to right. These phases summarize the same live readiness checks below, so there is no second checklist to maintain.</p></div>
            <Link href="/school/import" className="app-pill go-live-import-link"><DatabaseZap size={13}/> Migrate existing school data</Link>
          </div>
          <div className="go-live-path">
            {launchPath.map((item, index) => {
              const Icon = STATUS_COPY[item.status].icon;
              return <article className={`go-live-phase is-${item.status}`} key={item.title}>
                <div className="go-live-phase-top"><span>{index + 1}</span><Icon size={15}/></div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <small>{STATUS_COPY[item.status].label}</small>
                <Link href={item.href}>{item.action}</Link>
              </article>;
            })}
          </div>
        </section>

        <section className="app-card app-panel go-live-worklist" id="setup-worklist">
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
            <p><Link href="/school/support" className="app-pill"><LifeBuoy size={13}/> Open Pilot Support Center</Link></p>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
