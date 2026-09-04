import Link from "next/link";
import { Activity, ArrowRight, Building2, CreditCard, ExternalLink, MessageCircle, ShieldCheck, Users } from "lucide-react";

type AuditEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetEntity: string | null;
  createdAt: Date;
};

type WorkspaceProps = {
  school: {
    id: string;
    name: string;
    uniqueCode: string;
    status: string;
    createdAt: Date;
    subscriptionPlan: { id: string; name: string; price: unknown } | null;
    settings: { timezone: string | null; gradeCaWeight: unknown; gradeExamWeight: unknown } | null;
  };
  students: number;
  users: number;
  classes: number;
  subjects: number;
  recentMessages: number;
  failedMessages: number;
  unpaid: number;
  collected: number;
  audits: AuditEvent[];
  canSupport: boolean;
  canBilling: boolean;
  canAudit: boolean;
};

const formatDate = (value: Date) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const formatDateTime = (value: Date) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function PlatformSchool360Workspace({
  school, students, users, classes, subjects, recentMessages, failedMessages, unpaid, collected, audits, canSupport, canBilling, canAudit,
}: WorkspaceProps) {
  const status = String(school.status).toLowerCase();
  const isHealthy = status === "active";
  const planName = school.subscriptionPlan?.name ?? "No plan assigned";
  const attentionCount = unpaid + failedMessages;

  const workspaces = [
    { title: "People & access", eyebrow: "PEOPLE", body: "Inspect accounts, roles and audited support access.", href: `/platform/schools/${school.id}/people`, icon: Users },
    { title: "Finance & billing", eyebrow: "FINANCE", body: "Review invoices, collections and billing configuration.", href: canBilling ? `/platform/billing?schoolId=${encodeURIComponent(school.id)}` : null, icon: CreditCard },
    { title: "Activity center", eyebrow: "INVESTIGATE", body: "Trace tenant activity and platform control-plane events.", href: `/platform/schools/${school.id}/activity`, icon: Activity },
    { title: "Security review", eyebrow: "SECURITY", body: "Review sensitive access and control events.", href: canAudit ? `/platform/schools/${school.id}/activity?sensitive=1` : null, icon: ShieldCheck },
    ...(canSupport ? [{ title: "Support workspace", eyebrow: "SUPPORT", body: "Work cases with this school already in context.", href: `/platform/support?schoolId=${encodeURIComponent(school.id)}`, icon: MessageCircle }] : []),
  ];

  return <div className="platform-school360-shell">
    <div className="platform-school360-breadcrumb"><Link href="/platform/schools">Schools</Link><span>›</span><strong>{school.name}</strong></div>

    <header className="platform-school360-hero">
      <div className="platform-school360-identity">
        <div className="platform-school360-logo"><Building2 size={24}/></div>
        <div><span className="app-eyebrow">SCHOOL WORKSPACE</span><h1>{school.name}</h1><div className="platform-school360-meta-row"><span>{school.uniqueCode}</span><span>·</span><span>{planName}</span><span>·</span><span>Created {formatDate(school.createdAt)}</span></div></div>
      </div>
      <div className="platform-school360-hero-actions"><span className={`platform-status ${isHealthy ? "platform-status-healthy" : "platform-status-critical"}`}>{school.status}</span><Link className="app-pill" href="/platform/schools">Back to schools</Link></div>
      <div className="platform-school360-primary-actions">
        <Link className="app-action" href={`/platform/schools/${school.id}/people`}><Users size={16}/><strong>Open people</strong><span>Manage access context</span></Link>
        {canBilling ? <Link className="app-action" href={`/platform/billing?schoolId=${encodeURIComponent(school.id)}`}><CreditCard size={16}/><strong>Open billing</strong><span>Review commercial state</span></Link> : null}
        {canSupport ? <Link className="app-action" href={`/platform/support?schoolId=${encodeURIComponent(school.id)}`}><MessageCircle size={16}/><strong>Open support</strong><span>Work this school’s cases</span></Link> : null}
        <Link className="app-pill" href={`/platform/schools/${school.id}/activity`}><Activity size={15}/>Activity center</Link>
      </div>
    </header>

    <section className="platform-school360-commandbar">
      <div><span className="app-eyebrow">OPERATOR BRIEF</span><h2>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention` : "School is operating normally"}</h2><p>{attentionCount ? "Start with the signals below, then open the focused workspace that matches the issue." : "Use the focused workspaces below for people, finance, support, security or investigation."}</p></div>
      <div className="platform-school360-command-metrics"><div><strong>{students.toLocaleString()}</strong><span>Active learners</span></div><div><strong>{users.toLocaleString()}</strong><span>User accounts</span></div><div><strong>{classes.toLocaleString()}</strong><span>Classes</span></div></div>
    </section>

    <div className="platform-school360-section-heading"><div><span className="app-eyebrow">WORKSPACES</span><h2>Go straight to the job</h2></div><span>Each destination keeps this school in context.</span></div>
    <section className="platform-school360-workspace-grid">{workspaces.map((item) => { const Icon = item.icon; return item.href ? <Link href={item.href} key={item.title} className="platform-school360-workspace-card"><span className="platform-school360-workspace-icon"><Icon size={18}/></span><div><span className="app-eyebrow">{item.eyebrow}</span><h3>{item.title}</h3><p>{item.body}</p></div><ArrowRight size={17} className="platform-school360-arrow"/></Link> : <div key={item.title} className="platform-school360-workspace-card is-disabled" aria-disabled="true"><span className="platform-school360-workspace-icon"><Icon size={18}/></span><div><span className="app-eyebrow">{item.eyebrow}</span><h3>{item.title}</h3><p>This workspace is outside your current platform permissions.</p></div></div>; })}</section>

    <div className="platform-school360-main-grid">
      <section className="app-card platform-school360-panel"><div className="platform-school360-panel-head"><div><span className="app-eyebrow">ATTENTION</span><h2>What needs a decision?</h2><p>Only signals that should change an operator’s next action.</p></div></div><div className="platform-school360-attention-list">
        <div className={unpaid ? "is-warning" : "is-clear"}><div><strong>Unpaid invoices</strong><span>{unpaid ? `${unpaid} of the latest 20 invoices remain unpaid.` : "No unpaid invoices in the latest invoice set."}</span></div>{canBilling ? <Link href={`/platform/billing?schoolId=${encodeURIComponent(school.id)}`}>{unpaid ? "Review billing" : "Open billing"}<ArrowRight size={14}/></Link> : null}</div>
        <div className={failedMessages ? "is-danger" : "is-clear"}><div><strong>Message delivery</strong><span>{failedMessages ? `${failedMessages} messages failed in the last 7 days.` : "No failed messages in the last 7 days."}</span></div>{canAudit ? <Link href={`/platform/schools/${school.id}/activity`}>Investigate<ArrowRight size={14}/></Link> : null}</div>
        <div className="is-neutral"><div><strong>Communications volume</strong><span>{recentMessages.toLocaleString()} messages created in the last 24 hours.</span></div><span className="platform-school360-inline-value">Operational</span></div>
      </div></section>

      <section className="app-card platform-school360-panel"><div className="platform-school360-panel-head"><div><span className="app-eyebrow">COMMERCIAL</span><h2>Financial snapshot</h2><p>Subscription billing is separate from prepaid communications capacity.</p></div>{canBilling ? <Link className="app-pill" href={`/platform/billing?schoolId=${encodeURIComponent(school.id)}`}>Manage</Link> : null}</div><div className="platform-school360-finance-grid"><div><span>Plan</span><strong>{planName}</strong></div><div><span>Recent collections</span><strong>₵{collected.toLocaleString()}</strong></div><div><span>Unpaid invoices</span><strong className={unpaid ? "is-warning-text" : ""}>{unpaid}</strong></div><div><span>Subjects configured</span><strong>{subjects}</strong></div></div><div className="platform-school360-rule"><span>Grade configuration</span><strong>{Number(school.settings?.gradeCaWeight ?? 0)}% continuous · {Number(school.settings?.gradeExamWeight ?? 0)}% exam</strong></div></section>
    </div>

    <section className="app-card platform-school360-panel"><div className="platform-school360-panel-head"><div><span className="app-eyebrow">RECENT ACTIVITY</span><h2>What just happened?</h2><p>The latest platform audit events for this school.</p></div>{canAudit ? <Link className="app-action" href={`/platform/schools/${school.id}/activity`}><strong>Open full activity</strong><ExternalLink size={14}/></Link> : null}</div>{audits.length ? <div className="platform-school360-timeline">{audits.slice(0, 5).map((event) => <div className="platform-school360-timeline-row" key={event.id}><span className="platform-school360-timeline-dot"/><div><strong>{event.action}</strong><span>{event.actorName ?? event.actorEmail ?? "System"} · {event.targetEntity ?? "School"}</span></div><time>{formatDateTime(event.createdAt)}</time></div>)}</div> : <div className="platform-empty"><strong>No platform audit events yet.</strong><span>School activity may still exist in the tenant activity center.</span></div>}</section>

    <section className="platform-school360-profile-strip"><div><span className="app-eyebrow">SCHOOL PROFILE</span><strong>Tenant configuration</strong></div><div><span>Timezone</span><strong>{school.settings?.timezone ?? "Not configured"}</strong></div><div><span>Subscription</span><strong>{planName}</strong></div><div><span>Academic setup</span><strong>{subjects} subjects · {classes} classes</strong></div><Link href={`/platform/schools/${school.id}/people`}>View access <ArrowRight size={14}/></Link></section>

    <section className="platform-school360-lifecycle-intro"><div><span className="app-eyebrow">CONTROL & SAFETY</span><h2>Manage school access</h2><p>Lifecycle actions are kept separate from routine work so a destructive change is never an accidental click.</p></div></section>
  </div>;
}
