import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Building2,
  CreditCard,
  ExternalLink,
  GraduationCap,
  HardDrive,
  KeyRound,
  LifeBuoy,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  School,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import type { PlatformSchoolIntelligence } from "@/lib/platform-owner-intelligence";
import type { SchoolStorageEstimate } from "@/lib/platform-storage-service";
import { formatStorageBytes } from "@/lib/platform-storage-service";

type AuditEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetEntity: string | null;
  createdAt: Date;
};

type SchoolProfile = {
  schoolType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type ControlAccounts = {
  total: number;
  active: number;
  inactive: number;
  roleless: number;
  pendingPasswordChange: number;
  missingContact: number;
  leadership: number;
  guardians: number;
};

type WorkspaceProps = {
  school: {
    id: string;
    name: string;
    uniqueCode: string;
    status: string;
    createdAt: Date;
    subscriptionPlan: { id: string; name: string; price: unknown } | null;
    settings: {
      timezone: string | null;
      gradeCaWeight: unknown;
      gradeExamWeight: unknown;
      notificationChannels: unknown;
      smsSenderId: string | null;
    } | null;
  };
  profile: SchoolProfile;
  students: number;
  users: number;
  guardians: number;
  classes: number;
  subjects: number;
  recentMessages: number;
  failedMessages: number;
  supportOpen: number;
  messagingWallet: { smsBalance: number; whatsappBalance: number; status: string } | null;
  unpaid: number;
  collected: number;
  audits: AuditEvent[];
  storage: SchoolStorageEstimate;
  intelligence: PlatformSchoolIntelligence | null;
  controlAccounts: ControlAccounts;
  canSupport: boolean;
  canBilling: boolean;
  canAudit: boolean;
};

const formatDate = (value: Date) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const formatDateTime = (value: Date) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const titleCase = (value: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()) : "Not configured";
const yesNo = (value: boolean) => value ? "Ready" : "Missing";

function planPrice(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? `GHS ${number.toLocaleString()}` : "No recurring price";
}

function tableLabel(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function PlatformSchool360Workspace({
  school,
  profile,
  students,
  users,
  guardians,
  classes,
  subjects,
  recentMessages,
  failedMessages,
  supportOpen,
  messagingWallet,
  unpaid,
  collected,
  audits,
  storage,
  intelligence,
  controlAccounts,
  canSupport,
  canBilling,
  canAudit,
}: WorkspaceProps) {
  const status = String(school.status).toLowerCase();
  const health = intelligence?.health ?? (status === "active" ? "healthy" : "critical");
  const planName = school.subscriptionPlan?.name ?? "No plan assigned";
  const metrics = intelligence?.metrics;
  const location = [profile.city, profile.region, profile.country].filter(Boolean).join(", ") || "Location not configured";
  const smsBalance = Number(messagingWallet?.smsBalance ?? 0);
  const whatsappBalance = Number(messagingWallet?.whatsappBalance ?? 0);
  const gradeCa = Number(school.settings?.gradeCaWeight ?? 0);
  const gradeExam = Number(school.settings?.gradeExamWeight ?? 0);

  const workspaces = [
    { title: "People & access", body: "Accounts, roles, leadership, first-login security and access context.", href: `/platform/schools/${school.id}/people`, icon: Users },
    { title: "Academic evidence", body: "Classes, subjects, teacher connections, assessments and report activity.", href: `/platform/schools/${school.id}/activity?category=academics`, icon: BookOpenCheck },
    { title: "Finance & billing", body: "Platform billing, collections, balances and commercial configuration.", href: canBilling ? `/platform/billing?schoolId=${encodeURIComponent(school.id)}` : null, icon: CreditCard },
    { title: "Communications", body: "Delivery activity, messaging credits and failed-message investigation.", href: `/platform/schools/${school.id}/activity?category=communications`, icon: Mail },
    { title: "Support workspace", body: "Open cases and audited support activity already scoped to this school.", href: canSupport ? `/platform/support?schoolId=${encodeURIComponent(school.id)}` : null, icon: LifeBuoy },
    { title: "Activity & audit", body: "Trace tenant and control-plane changes with this school in context.", href: `/platform/schools/${school.id}/activity`, icon: Activity },
  ];

  const issues = intelligence?.issues ?? [];
  const academicStatus = [
    { label: "Academic year", value: yesNo(Boolean(metrics?.currentAcademicYear)), detail: metrics?.currentAcademicYear ? "Current year covers today" : "No year currently covers today" },
    { label: "Current term", value: yesNo(Boolean(metrics?.currentTerm)), detail: metrics?.currentTerm ? "Term-aware workflows can resolve" : "Gradebook/report period is unresolved" },
    { label: "Teaching assignments", value: String(metrics?.teachingAssignments ?? 0), detail: `${metrics?.classesWithoutTeacher ?? 0} classes without class teacher` },
    { label: "Assessments", value: String(metrics?.assessmentsInCurrentTerm ?? 0), detail: `${metrics?.reportsInCurrentTerm ?? 0} reports in current term` },
  ];

  return <div className="platform-school360-v3">
    <header className="platform-school360-v3-hero">
      <div className="platform-school360-v3-identity">
        <span className="platform-school360-v3-logo"><School size={22}/></span>
        <div>
          <span className="platform-eyebrow">School 360</span>
          <h2>{school.name}</h2>
          <div className="platform-school360-v3-meta"><span>{school.uniqueCode}</span><span>·</span><span>{planName}</span><span>·</span><span>{location}</span><span>·</span><span>Created {formatDate(school.createdAt)}</span></div>
        </div>
      </div>
      <div className="platform-school360-v3-actions">
        <span className={`platform-v3-status is-${health}`}>{health === "healthy" ? "Healthy" : health === "watch" ? "Watch" : "Critical"}</span>
        <Link className="app-pill" href="/platform/schools">Back to network</Link>
        <Link className="app-action" href={`/platform/schools/${school.id}/people`}><Users size={14}/><strong>People</strong></Link>
        {canSupport ? <Link className="app-pill" href={`/platform/support?schoolId=${encodeURIComponent(school.id)}`}><MessageCircle size={14}/>Support</Link> : null}
      </div>
    </header>

    <nav className="platform-school360-v3-tabs" aria-label="School 360 sections">
      <a className="is-active" href="#school-overview">Overview</a>
      <a href="#school-people">People & access</a>
      <a href="#school-academics">Academics</a>
      <a href="#school-finance">Finance</a>
      <a href="#school-communications">Communications</a>
      <a href="#school-storage">Storage</a>
      <a href="#school-activity">Audit</a>
    </nav>

    <section className="platform-school360-v3-kpis" aria-label="School operating summary">
      <article className="platform-school360-v3-kpi"><span>Readiness</span><strong>{intelligence ? `${intelligence.readinessScore}%` : "—"}</strong><small>{issues.length} current finding{issues.length === 1 ? "" : "s"}</small></article>
      <article className="platform-school360-v3-kpi"><span>Learners</span><strong>{students.toLocaleString()}</strong><small>{metrics?.studentsWithoutClass ?? 0} without class</small></article>
      <article className="platform-school360-v3-kpi"><span>Active accounts</span><strong>{controlAccounts.active.toLocaleString()}</strong><small>{controlAccounts.total.toLocaleString()} total users</small></article>
      <article className="platform-school360-v3-kpi"><span>Guardians</span><strong>{guardians.toLocaleString()}</strong><small>{metrics?.studentsWithoutGuardian ?? 0} learners unlinked</small></article>
      <article className="platform-school360-v3-kpi"><span>Academic setup</span><strong>{classes} / {subjects}</strong><small>classes / subjects</small></article>
      <article className="platform-school360-v3-kpi"><span>Database footprint</span><strong>{formatStorageBytes(storage.bytes)}</strong><small>{storage.rows.toLocaleString()} tenant rows</small></article>
    </section>

    <div className="platform-school360-v3-grid" id="school-overview">
      <div className="platform-school360-v3-section-stack">
        <section className="platform-school360-v3-section">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Operator brief</span><h3>{issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} deserve attention` : "No current operational blocker"}</h3><p>{intelligence?.recommendedAction ?? "This school has not accumulated enough evidence for a deeper recommendation yet."}</p></div></div>
          {issues.length ? <div className="platform-school360-v3-issue-list">{issues.slice(0, 5).map((issue) => <div key={issue.code} className={`platform-school360-v3-issue is-${issue.severity}`}><span className="platform-school360-v3-issue-icon"><ShieldCheck size={14}/></span><div><b>{issue.title}</b><p>{issue.detail}</p><small>{issue.action}</small></div><span className="platform-school360-v3-issue-severity">{issue.severity}</span></div>)}</div> : <div className="platform-school360-v3-clear"><ShieldCheck size={18}/><div><b>School is clear on the current checks.</b><span>Continue normal monitoring and complete the remaining pilot evidence when appropriate.</span></div></div>}
        </section>

        <section className="platform-school360-v3-section">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Go to the job</span><h3>School workspaces</h3><p>Open the operational area you need without leaving school context behind.</p></div></div>
          <div className="platform-school360-v3-workspaces">{workspaces.map(({ title, body, href, icon: Icon }) => href ? <Link href={href} className="platform-school360-v3-workspace" key={title}><span><Icon size={15}/></span><div><b>{title}</b><small>{body}</small></div><ArrowRight size={13}/></Link> : <div className="platform-school360-v3-workspace is-disabled" key={title}><span><Icon size={15}/></span><div><b>{title}</b><small>Outside your current platform permissions.</small></div></div>)}</div>
        </section>
      </div>

      <aside className="platform-school360-v3-section-stack">
        <section className="platform-school360-v3-section">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">School profile</span><h3>Identity & contact</h3></div></div>
          <div className="platform-school360-v3-overview">
            <div><span>School type</span><strong>{titleCase(profile.schoolType)}</strong><small>Tenant classification</small></div>
            <div><span>Timezone</span><strong>{school.settings?.timezone ?? "Not configured"}</strong><small>Calendar and attendance clock</small></div>
            <div><span>Location</span><strong>{location}</strong><small>{profile.address ?? "No street/postal address"}</small></div>
            <div><span>Contact</span><strong>{profile.phone ?? "No phone"}</strong><small>{profile.email ?? "No school email"}</small></div>
          </div>
          <div className="platform-school360-v3-contact-row"><MapPin size={13}/><span>{profile.address ?? location}</span></div>
          <div className="platform-school360-v3-contact-row"><Phone size={13}/><span>{profile.phone ?? "School phone not configured"}</span></div>
          <div className="platform-school360-v3-contact-row"><Mail size={13}/><span>{profile.email ?? "School email not configured"}</span></div>
        </section>

        <section className="platform-school360-v3-section" id="school-storage">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Storage</span><h3>Tenant database footprint</h3><p>Measured school-owned PostgreSQL row data. External file hosting is not falsely counted here.</p></div></div>
          <div className="platform-school360-v3-storage"><div className="platform-school360-v3-storage-total"><div><strong>{formatStorageBytes(storage.bytes)}</strong><span>{storage.rows.toLocaleString()} rows · {storage.tables} non-empty tables</span></div><HardDrive size={21}/></div>{storage.largestTables.length ? storage.largestTables.map((item) => <div className="platform-school360-v3-storage-row" key={item.table}><div><b>{tableLabel(item.table)}</b><span>{item.rows.toLocaleString()} rows</span></div><strong>{formatStorageBytes(item.bytes)}</strong></div>) : <div className="platform-school360-v3-clear"><HardDrive size={17}/><div><b>No tenant data footprint yet.</b><span>Storage will grow as the school starts using SukuuNova.</span></div></div>}</div>
        </section>
      </aside>
    </div>

    <div className="platform-school360-v3-grid">
      <div className="platform-school360-v3-section-stack">
        <section className="platform-school360-v3-section" id="school-people">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">People & access</span><h3>Who can operate this school?</h3><p>Access health, leadership coverage and first-login security in one place.</p></div><Link className="app-pill" href={`/platform/schools/${school.id}/people`}>Open people</Link></div>
          <div className="platform-school360-v3-stat-grid">
            <div><span>Active users</span><strong>{controlAccounts.active}</strong><small>{controlAccounts.inactive} inactive</small></div>
            <div><span>Leadership</span><strong>{controlAccounts.leadership}</strong><small>owner/principal/admin roles</small></div>
            <div><span>Guardian accounts</span><strong>{controlAccounts.guardians}</strong><small>{guardians} guardian records</small></div>
            <div className={controlAccounts.roleless ? "has-warning" : ""}><span>Without roles</span><strong>{controlAccounts.roleless}</strong><small>active accounts needing responsibility</small></div>
            <div className={controlAccounts.pendingPasswordChange ? "has-warning" : ""}><span>Password change pending</span><strong>{controlAccounts.pendingPasswordChange}</strong><small>first-login security incomplete</small></div>
            <div className={controlAccounts.missingContact ? "has-warning" : ""}><span>Missing contact</span><strong>{controlAccounts.missingContact}</strong><small>active users without phone/email</small></div>
          </div>
        </section>

        <section className="platform-school360-v3-section" id="school-academics">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Academics</span><h3>Is the academic engine connected?</h3><p>Calendar, class ownership, teaching assignments and term evidence.</p></div></div>
          <div className="platform-school360-v3-stat-grid">{academicStatus.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}<div className={(metrics?.studentsWithoutClass ?? 0) ? "has-warning" : ""}><span>Learners without class</span><strong>{metrics?.studentsWithoutClass ?? 0}</strong><small>miss attendance, gradebook and timetable routing</small></div><div><span>Grade weights</span><strong>{gradeCa}% / {gradeExam}%</strong><small>continuous assessment / examination</small></div></div>
        </section>
      </div>

      <aside className="platform-school360-v3-section-stack">
        <section className="platform-school360-v3-section" id="school-finance">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Finance</span><h3>Commercial snapshot</h3></div>{canBilling ? <Link className="app-pill" href={`/platform/billing?schoolId=${encodeURIComponent(school.id)}`}>Manage billing</Link> : null}</div>
          <div className="platform-school360-v3-overview"><div><span>Plan</span><strong>{planName}</strong><small>{planPrice(school.subscriptionPlan?.price)}</small></div><div><span>Recent collections</span><strong>GHS {collected.toLocaleString()}</strong><small>latest payment set</small></div><div><span>Unpaid invoices</span><strong>{unpaid}</strong><small>within latest 20 invoices</small></div><div><span>School state</span><strong>{titleCase(status)}</strong><small>tenant lifecycle status</small></div></div>
        </section>

        <section className="platform-school360-v3-section" id="school-communications">
          <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Communications & support</span><h3>Delivery posture</h3></div>{canSupport ? <Link className="app-pill" href={`/platform/support?schoolId=${encodeURIComponent(school.id)}`}>Support</Link> : null}</div>
          <div className="platform-school360-v3-stat-grid compact"><div><span>Messages · 24h</span><strong>{recentMessages}</strong><small>created by school workflows</small></div><div className={failedMessages ? "has-warning" : ""}><span>Failed · 7d</span><strong>{failedMessages}</strong><small>delivery failures</small></div><div><span>SMS balance</span><strong>{smsBalance}</strong><small>sender: {school.settings?.smsSenderId ?? "not configured"}</small></div><div><span>WhatsApp balance</span><strong>{whatsappBalance}</strong><small>wallet status: {messagingWallet?.status ?? "not provisioned"}</small></div><div className={supportOpen ? "has-warning" : ""}><span>Open support cases</span><strong>{supportOpen}</strong><small>open or in progress</small></div></div>
        </section>
      </aside>
    </div>

    <section className="platform-school360-v3-section" id="school-activity">
      <div className="platform-school360-v3-section-head"><div><span className="platform-eyebrow">Recent control activity</span><h3>What just changed?</h3><p>Latest Platform-side events for this tenant. Open Activity for the deeper school timeline.</p></div>{canAudit ? <Link className="app-pill" href={`/platform/schools/${school.id}/activity`}>Full activity <ExternalLink size={13}/></Link> : null}</div>
      {audits.length ? <div className="platform-school360-v3-timeline">{audits.slice(0, 7).map((event) => <div className="platform-school360-v3-timeline-row" key={event.id}><span className="platform-school360-v3-timeline-icon"><Activity size={13}/></span><div><b>{event.action}</b><span>{event.actorName ?? event.actorEmail ?? "System"} · {event.targetEntity ?? "School"}</span></div><time>{formatDateTime(event.createdAt)}</time></div>)}</div> : <div className="platform-school360-v3-clear"><Activity size={17}/><div><b>No platform audit activity yet.</b><span>This is expected for a newly created school.</span></div></div>}
    </section>

    <section className="platform-school360-v3-control-intro"><span><KeyRound size={16}/></span><div><span className="platform-eyebrow">Deep control & safety</span><h3>Privileged school controls</h3><p>Session revocation, impersonation, account security and lifecycle actions remain below this point so high-impact actions never compete with everyday monitoring.</p></div></section>
  </div>;
}
