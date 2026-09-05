import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Mail, Megaphone, Plus, UserPlus } from "lucide-react";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { FinanceDashboard, financeDashboardStyles } from "@/components/FinanceDashboard";

function isFinanceRole(roles: string[]) {
  return roles.some((role) => {
    const normalized = role.toLowerCase();
    return normalized.includes("accountant") || normalized.includes("bursar") || normalized === "finance officer" || normalized === "cashier" || normalized === "finance clerk";
  });
}

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (schoolSession) {
    const overview = await withTenant(schoolSession.schoolId, async (tx) => {
      const [account, access] = await Promise.all([
        tx.user.findUnique({ where: { id: schoolSession.userId }, select: { name: true, school: { select: { name: true, uniqueCode: true } } } }),
        getSchoolAuthorization(tx, schoolSession.userId),
      ]);
      return { account, access };
    });

    if (!overview.account) redirect("/login/school");
    if (overview.access.workspace === "teacher") redirect("/teacher");

    const schoolOverview = await withTenant(schoolSession.schoolId, async (tx) => {
      const [students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements, academicYears, terms, reportTemplates, pendingReportCards, pendingFeeAdjustments, pendingStaff, activatedNonOwnerStaff, hasBranding] = await Promise.all([
        tx.student.count(),
        tx.guardian.count(),
        tx.user.count(),
        tx.class.count(),
        tx.subject.count(),
        tx.feeItem.count(),
        tx.invoice.count(),
        tx.payment.count(),
        tx.attendanceEvent.count(),
        tx.calendarEvent.count(),
        tx.message.findMany({ where: { recipientId: schoolSession.userId, channel: "in_app" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, body: true, createdAt: true } }),
        tx.academicYear.count(),
        tx.term.count(),
        tx.reportCardTemplate.count({ where: { OR: [{ schoolId: schoolSession.schoolId }, { schoolId: null }] } }),
        tx.reportCard.count({ where: { status: "submitted" } }),
        tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND "status"='pending'`, schoolSession.schoolId),
        tx.user.count({ where: { status: "pending", userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } } } }),
        tx.user.count({ where: { status: "active", NOT: { userRoles: { some: { role: { key: "owner" } } } }, userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } } } }),
        tx.school.findUnique({ where: { id: schoolSession.schoolId }, select: { logoUrl: true, brandColors: true } }).then((s) => Boolean(s?.logoUrl || s?.brandColors)),
      ]);
      return { students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements, academicYears, terms, reportTemplates, pendingReportCards, pendingFeeAdjustments: pendingFeeAdjustments[0]?.count ?? 0, pendingStaff, activatedNonOwnerStaff, hasBranding };
    });

    const roleNames = overview.access.roles.map((entry) => entry.name);
    const role = roleNames.join(", ") || "Administrator";
    if (isFinanceRole(roleNames)) {
      return <><AppShell universe="school" title="Finance workspace" subtitle={`${overview.account.school.name} · ${overview.account.school.uniqueCode} · ${role}`} active="Overview" schoolName={overview.account.school.name} schoolCode={overview.account.school.uniqueCode} userName={overview.account.name} role={role}><FinanceDashboard name={overview.account.name} school={overview.account.school.name} code={overview.account.school.uniqueCode} role={role} stats={{ invoices: schoolOverview.invoices, payments: schoolOverview.payments, pendingFeeAdjustments: schoolOverview.pendingFeeAdjustments }} /></AppShell><style>{financeDashboardStyles}</style></>;
    }

    return <SchoolAdminDashboard name={overview.account.name} school={overview.account.school.name} code={overview.account.school.uniqueCode} role={role} stats={schoolOverview} />;
  }

  const platformSession = await getPlatformSession();
  if (platformSession) redirect("/platform");
  redirect("/");
}

type AnnouncementPreview = { id: string; body: string; createdAt: Date };
type SchoolStats = { students: number; guardians: number; staff: number; classes: number; subjects: number; feeItems: number; invoices: number; payments: number; attendance: number; events: number; announcements: AnnouncementPreview[]; academicYears: number; terms: number; reportTemplates: number; pendingStaff: number; pendingReportCards: number; pendingFeeAdjustments: number; activatedNonOwnerStaff: number; hasBranding: boolean };

const quickStats = [["Students", "students", "/school/students"], ["Classes", "classes", "/school/classes"], ["Staff", "staff", "/school/staff"], ["Guardians", "guardians", "/school/guardians"]] as const;

function SchoolAdminDashboard({ name, school, code, role, stats }: { name: string; school: string; code: string; role: string; stats: SchoolStats }) {
  const setup = [["School profile & branding", Boolean(stats.hasBranding), "/school/settings"], ["Academic calendar", stats.academicYears > 0 && stats.terms > 0, "/school/terms"], ["Classes & subjects", stats.classes > 0 && stats.subjects > 0, "/school/classes"], ["Students", stats.students > 0, "/school/students"], ["Staff accounts", stats.activatedNonOwnerStaff > 0 && stats.pendingStaff === 0, "/school/settings/access"], ["Fee structure", stats.feeItems > 0, "/school/fees"], ["Report-card templates", stats.reportTemplates > 0, "/school/report-cards"]] as const;
  const completed = setup.filter(([, done]) => done).length;
  const progress = Math.round((completed / setup.length) * 100);
  const attention = [
    stats.pendingReportCards > 0 ? { label: "Report cards awaiting approval", detail: `${stats.pendingReportCards} submitted report${stats.pendingReportCards === 1 ? "" : "s"} need review.`, href: "/school/report-cards", tone: "review" } : null,
    stats.pendingFeeAdjustments > 0 ? { label: "Fee adjustments awaiting approval", detail: `${stats.pendingFeeAdjustments} adjustment${stats.pendingFeeAdjustments === 1 ? "" : "s"} need a second person to approve.`, href: "/school/fees/overview", tone: "finance" } : null,
    stats.pendingStaff > 0 ? { label: "Staff accounts waiting for activation", detail: `${stats.pendingStaff} account${stats.pendingStaff === 1 ? "" : "s"} still need access setup.`, href: "/school/settings/access", tone: "people" } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; href: string; tone: string }>;
  return <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]}`} subtitle={`${school} · ${code} · ${role}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
    <div className="admin-command-center">
      <section className="admin-command-hero"><div><span className="admin-eyebrow">School command centre</span><h1>Your school, organised around what needs action.</h1><p>See readiness, approvals, people and core school activity without hunting through separate modules.</p></div><div className="admin-hero-actions"><Link className="admin-primary-action" href="/school/settings">Open school settings</Link><Link className="admin-secondary-action" href="/school/reports">View reports</Link></div></section>
      <section className="admin-command-grid"><article className="admin-readiness-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Setup readiness</span><h2>Get the school ready</h2><p>{completed} of {setup.length} essentials are configured.</p></div><strong className="admin-progress-value">{progress}%</strong></div><div className="admin-progress-track"><span style={{ width: `${progress}%` }} /></div><div className="admin-setup-list">{setup.map(([label, done, href]) => <Link key={label} href={href} className={`admin-setup-row ${done ? "is-done" : "is-open"}`}><span aria-hidden="true">{done ? <CheckCircle2 size={15} strokeWidth={2.2} /> : <Circle size={15} strokeWidth={2.2} />}</span><div><strong>{label}</strong><small>{done ? "Configured" : "Needs attention"}</small></div>{!done && <b>Fix <ArrowRight size={13} strokeWidth={2.4} /></b>}</Link>)}</div></article><article className="admin-attention-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Needs your attention</span><h2>Important work</h2><p>Approval and activation queues already waiting in your school.</p></div></div>{attention.length ? <div className="admin-attention-list">{attention.map((item) => <Link href={item.href} key={item.label} className={`admin-attention-row tone-${item.tone}`}><span className="admin-attention-mark" aria-hidden="true"><AlertCircle size={16} strokeWidth={2.2} /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div><b>Open <ArrowRight size={13} strokeWidth={2.4} /></b></Link>)}</div> : <div className="admin-clear-state"><span aria-hidden="true"><CheckCircle2 size={17} strokeWidth={2.2} /></span><div><strong>Nothing urgent right now.</strong><p>Approval queues and account activations are clear.</p></div></div>}</article></section>
      <section className="admin-section-block"><div className="admin-section-head"><div><span className="admin-eyebrow">School snapshot</span><h2>The numbers that matter every day.</h2></div><Link href="/school/reports">Full reports <ArrowRight size={13} strokeWidth={2.4} /></Link></div><div className="admin-stat-grid">{quickStats.map(([label, key, href]) => <Link href={href} key={key} className="admin-stat-card"><span>{label}</span><strong>{stats[key]}</strong><small>Open {label.toLowerCase()} <ArrowRight size={12} strokeWidth={2.4} /></small></Link>)}</div></section>
      <section className="admin-lower-grid"><article className="admin-panel-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Academic & operations</span><h2>At a glance</h2></div></div><div className="admin-metric-list">{[["Subjects",stats.subjects,"/school/subjects"],["Fee items",stats.feeItems,"/school/fees"],["Invoices",stats.invoices,"/school/fees/invoices"],["Payments",stats.payments,"/school/fees/payments"],["Attendance records",stats.attendance,"/school/attendance"],["Calendar events",stats.events,"/school/terms"]].map(([label,value,href]) => <Link href={href as string} className="admin-metric-row" key={label as string}><span>{label}</span><strong>{value}</strong><b><ArrowRight size={13} strokeWidth={2.4} /></b></Link>)}</div></article><article className="admin-panel-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Recent communication</span><h2>Your inbox</h2></div><Link href="/school/communications/messages">Open <ArrowRight size={13} strokeWidth={2.4} /></Link></div>{stats.announcements.length ? <div className="admin-message-list">{stats.announcements.map((item) => <Link href="/school/communications/messages" className="admin-message-row" key={item.id}><span aria-hidden="true"><Mail size={15} strokeWidth={2.2} /></span><div><strong>{item.body.split("\n")[0]}</strong><small>{item.body.replace(/\n/g, " ").slice(0, 120)}</small></div></Link>)}</div> : <div className="admin-empty-state"><span aria-hidden="true"><Mail size={18} strokeWidth={2.2} /></span><strong>Your inbox is quiet.</strong><p>New school messages will appear here.</p></div>}</article></section>
      <section className="admin-section-block admin-quick-actions"><div className="admin-section-head"><div><span className="admin-eyebrow">Quick actions</span><h2>Start the work that changes the school.</h2></div></div><div className="admin-action-grid"><Link href="/school/students"><strong><UserPlus size={14} strokeWidth={2.2} /> Add student</strong><span>Create a new learner record.</span></Link><Link href="/school/classes"><strong><Plus size={14} strokeWidth={2.4} /> Create class</strong><span>Build or update class structure.</span></Link><Link href="/school/staff"><strong><UserPlus size={14} strokeWidth={2.2} /> Add staff</strong><span>Bring another member into the school.</span></Link><Link href="/school/communications/announcements"><strong><Megaphone size={14} strokeWidth={2.2} /> Send announcement</strong><span>Share an update with the school community.</span></Link></div></section>
    </div><style>{adminCommandStyles}</style>
  </AppShell>;
}

const adminCommandStyles = `
.admin-command-center {
  display: grid;
  gap: 20px;
  max-width: 1480px;
  margin: 0 auto;
  padding: 4px 0 48px;
}

.admin-command-hero,
.admin-readiness-card,
.admin-attention-card,
.admin-panel-card,
.admin-section-block {
  border: 1px solid var(--sn-line);
  background: var(--sn-surface);
  border-radius: var(--sn-radius-xl);
  box-shadow: var(--sn-shadow-sm);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.admin-command-hero:hover,
.admin-readiness-card:hover,
.admin-attention-card:hover,
.admin-panel-card:hover,
.admin-section-block:hover {
  box-shadow: var(--sn-shadow-md);
}

.admin-command-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 28px 32px;
  background: linear-gradient(135deg, var(--sn-surface) 0%, var(--sn-primary-soft) 100%);
}

.admin-eyebrow {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sn-primary-deep);
}

.admin-command-hero h1 {
  max-width: 780px;
  margin: 8px 0 6px;
  font-size: clamp(24px, 2.5vw, 32px);
  line-height: 1.15;
  letter-spacing: -0.035em;
  color: var(--sn-ink);
  font-weight: 850;
}

.admin-command-hero p,
.admin-section-head p {
  margin: 0;
  color: var(--sn-muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.admin-hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.admin-primary-action,
.admin-secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  min-height: 40px;
  border-radius: var(--sn-radius-md);
  text-decoration: none;
  font-size: 13px;
  font-weight: 750;
  transition: all 0.15s ease;
}

.admin-primary-action {
  background: var(--sn-primary);
  color: #fff;
  box-shadow: var(--sn-shadow-sm);
}

.admin-primary-action:hover {
  background: var(--sn-primary-deep);
  transform: translateY(-1px);
  box-shadow: var(--sn-shadow-md);
}

.admin-secondary-action {
  background: var(--sn-surface);
  border: 1px solid var(--sn-line);
  color: var(--sn-ink);
}

.admin-secondary-action:hover {
  background: var(--sn-surface-2);
  border-color: var(--sn-line-strong);
}

.admin-command-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 20px;
}

.admin-readiness-card,
.admin-attention-card {
  padding: 24px;
}

.admin-section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.admin-section-head h2 {
  margin: 4px 0 2px;
  color: var(--sn-ink);
  font-size: 19px;
  letter-spacing: -0.025em;
  font-weight: 800;
}

.admin-section-head > a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 750;
  color: var(--sn-primary);
  text-decoration: none;
}

.admin-section-head > a:hover {
  text-decoration: underline;
}

.admin-progress-value {
  font-size: 26px;
  font-weight: 850;
  color: var(--sn-primary);
}

.admin-progress-track {
  height: 8px;
  margin: 16px 0 18px;
  border-radius: 999px;
  background: var(--sn-surface-3);
  overflow: hidden;
}

.admin-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--sn-primary), var(--sn-primary-deep));
}

.admin-setup-list,
.admin-attention-list,
.admin-metric-list,
.admin-message-list {
  display: grid;
  gap: 8px;
}

.admin-setup-row,
.admin-attention-row,
.admin-metric-row,
.admin-message-row {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  border: 1px solid var(--sn-line);
  border-radius: var(--sn-radius-md);
  background: var(--sn-surface-2);
  color: var(--sn-ink);
  transition: all 0.15s ease;
}

.admin-setup-row:hover,
.admin-attention-row:hover,
.admin-metric-row:hover,
.admin-message-row:hover {
  background: var(--sn-surface);
  border-color: var(--sn-line-strong);
  box-shadow: var(--sn-shadow-sm);
  transform: translateX(1px);
}

.admin-setup-row {
  padding: 12px 14px;
}

.admin-setup-row > span {
  width: 28px;
  height: 28px;
  border-radius: var(--sn-radius-sm);
  display: grid;
  place-items: center;
  background: var(--sn-success-soft);
  color: var(--sn-success);
  flex-shrink: 0;
}

.admin-setup-row.is-open > span {
  background: var(--sn-warning-soft);
  color: var(--sn-warning);
}

.admin-setup-row div,
.admin-attention-row div,
.admin-message-row div {
  min-width: 0;
  flex: 1;
}

.admin-setup-row strong,
.admin-attention-row strong,
.admin-message-row strong {
  display: block;
  font-size: 13.5px;
  font-weight: 700;
}

.admin-setup-row small,
.admin-attention-row small,
.admin-message-row small {
  display: block;
  margin-top: 2px;
  color: var(--sn-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

.admin-setup-row b,
.admin-attention-row > b {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 750;
  color: var(--sn-primary);
}

.admin-attention-row {
  padding: 14px 16px;
}

.admin-attention-mark {
  width: 32px;
  height: 32px;
  border-radius: var(--sn-radius-md);
  display: grid;
  place-items: center;
  background: var(--sn-warning-soft);
  color: var(--sn-warning);
  font-weight: 800;
  flex-shrink: 0;
}

.tone-finance .admin-attention-mark {
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
}

.tone-people .admin-attention-mark {
  background: var(--sn-primary-soft);
  color: var(--sn-primary);
}

.admin-clear-state {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  padding: 20px;
  border-radius: var(--sn-radius-lg);
  background: var(--sn-success-soft);
  border: 1px solid rgba(22, 163, 74, 0.2);
}

.admin-clear-state > span {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--sn-radius-md);
  background: #fff;
  color: var(--sn-success);
  font-weight: 800;
  flex-shrink: 0;
}

.admin-clear-state strong {
  font-size: 14px;
  font-weight: 750;
  color: var(--sn-ink);
}

.admin-clear-state p {
  margin: 2px 0 0;
  color: var(--sn-muted);
  font-size: 12.5px;
}

.admin-section-block {
  padding: 24px;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-top: 16px;
}

.admin-stat-card {
  padding: 18px;
  text-decoration: none;
  border: 1px solid var(--sn-line);
  border-radius: var(--sn-radius-lg);
  background: var(--sn-surface-2);
  transition: all 0.15s ease;
}

.admin-stat-card:hover {
  background: var(--sn-surface);
  border-color: var(--sn-line-strong);
  box-shadow: var(--sn-shadow-md);
  transform: translateY(-2px);
}

.admin-stat-card span {
  display: block;
  color: var(--sn-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.admin-stat-card strong {
  display: block;
  margin: 6px 0;
  font-size: 28px;
  font-weight: 850;
  letter-spacing: -0.03em;
  color: var(--sn-ink);
}

.admin-stat-card small {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sn-primary);
  font-size: 12px;
  font-weight: 750;
}

.admin-lower-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.admin-panel-card {
  padding: 24px;
}

.admin-metric-row {
  padding: 12px 14px;
}

.admin-metric-row span {
  font-size: 13px;
  font-weight: 600;
  color: var(--sn-ink-2);
  flex: 1;
}

.admin-metric-row strong {
  font-size: 14px;
  font-weight: 800;
  color: var(--sn-ink);
}

.admin-metric-row b {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--sn-primary);
}

.admin-message-row {
  padding: 14px;
}

.admin-message-row > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--sn-radius-sm);
  background: var(--sn-primary-soft);
  color: var(--sn-primary);
  flex-shrink: 0;
}

.admin-empty-state {
  text-align: center;
  padding: 36px 18px;
}

.admin-empty-state > span {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  border: 1px dashed var(--sn-line-strong);
  border-radius: var(--sn-radius-md);
  color: var(--sn-primary);
}

.admin-empty-state strong {
  display: block;
  font-size: 14px;
  font-weight: 750;
  color: var(--sn-ink);
}

.admin-empty-state p {
  margin: 4px 0 0;
  color: var(--sn-muted);
  font-size: 12.5px;
}

.admin-quick-actions {
  padding-bottom: 28px;
}

.admin-action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.admin-action-grid a {
  padding: 16px;
  border: 1px solid var(--sn-line);
  border-radius: var(--sn-radius-lg);
  background: var(--sn-surface-2);
  text-decoration: none;
  transition: all 0.15s ease;
}

.admin-action-grid a:hover {
  background: var(--sn-surface);
  border-color: var(--sn-line-strong);
  box-shadow: var(--sn-shadow-md);
  transform: translateY(-2px);
}

.admin-action-grid strong {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sn-ink);
  font-size: 13.5px;
  font-weight: 750;
}

.admin-action-grid span {
  display: block;
  margin-top: 4px;
  color: var(--sn-muted);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 980px) {
  .admin-command-hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .admin-hero-actions {
    justify-content: flex-start;
  }
  .admin-command-grid,
  .admin-lower-grid {
    grid-template-columns: 1fr;
  }
  .admin-stat-grid,
  .admin-action-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 620px) {
  .admin-stat-grid,
  .admin-action-grid {
    grid-template-columns: 1fr;
  }
  .admin-command-hero {
    padding: 20px;
  }
  .admin-command-hero h1 {
    font-size: 24px;
  }
  .admin-readiness-card,
  .admin-attention-card,
  .admin-panel-card,
  .admin-section-block {
    padding: 18px;
  }
  .admin-primary-action,
  .admin-secondary-action {
    width: 100%;
    text-align: center;
  }
}
`;
