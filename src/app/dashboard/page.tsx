import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

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
      const [
        students,
        guardians,
        staff,
        classes,
        subjects,
        feeItems,
        invoices,
        payments,
        attendance,
        events,
        announcements,
        academicYears,
        terms,
        reportTemplates,
        pendingReportCards,
        pendingFeeAdjustments,
        pendingStaff,
        activatedNonOwnerStaff,
        hasBranding,
      ] = await Promise.all([
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
        tx.message.findMany({
          where: { recipientId: schoolSession.userId, channel: "in_app" },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, body: true, createdAt: true },
        }),
        tx.academicYear.count(),
        tx.term.count(),
        tx.reportCardTemplate.count({ where: { OR: [{ schoolId: schoolSession.schoolId }, { schoolId: null }] } }),
        tx.reportCard.count({ where: { status: "submitted" } }),
        tx.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count FROM "P3FinanceAdjustment" WHERE "schoolId"=$1 AND "status"='pending'`,
          schoolSession.schoolId,
        ),
        tx.user.count({
          where: {
            status: "pending",
            userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } },
          },
        }),
        tx.user.count({
          where: { status: "active", NOT: { userRoles: { some: { role: { key: "owner" } } } }, userRoles: { some: { role: { key: { notIn: ["guardian", "parent", "student"] } } } } },
        }),
        tx.school.findUnique({ where: { id: schoolSession.schoolId }, select: { logoUrl: true, brandColors: true } }).then(s => Boolean(s?.logoUrl || s?.brandColors)),
      ]);

      return {
        students,
        guardians,
        staff,
        classes,
        subjects,
        feeItems,
        invoices,
        payments,
        attendance,
        events,
        announcements,
        academicYears,
        terms,
        reportTemplates,
        pendingReportCards,
        pendingFeeAdjustments: pendingFeeAdjustments[0]?.count ?? 0,
        pendingStaff,
        activatedNonOwnerStaff,
        hasBranding,
      };
    });

    const role = overview.access.roles.map((entry) => entry.name).join(", ") || "Administrator";
    return <SchoolAdminDashboard name={overview.account.name} school={overview.account.school.name} code={overview.account.school.uniqueCode} role={role} stats={schoolOverview} />;
  }

  const platformSession = await getPlatformSession();
  if (platformSession) redirect("/platform");
  redirect("/");
}

type AnnouncementPreview = { id: string; body: string; createdAt: Date };
type SchoolStats = {
  students: number; guardians: number; staff: number; classes: number; subjects: number; feeItems: number;
  invoices: number; payments: number; attendance: number; events: number; announcements: AnnouncementPreview[];
  academicYears: number; terms: number; reportTemplates: number; pendingStaff: number; pendingReportCards: number; pendingFeeAdjustments: number; activatedNonOwnerStaff: number; hasBranding: boolean;
};

const quickStats = [
  ["Students", "students", "/school/students"],
  ["Classes", "classes", "/school/classes"],
  ["Staff", "staff", "/school/staff"],
  ["Guardians", "guardians", "/school/guardians"],
] as const;

function SchoolAdminDashboard({ name, school, code, role, stats }: { name: string; school: string; code: string; role: string; stats: SchoolStats }) {
  const setup = [
    ["School profile & branding", Boolean(stats.hasBranding), "/school/settings"],
    ["Academic calendar", stats.academicYears > 0 && stats.terms > 0, "/school/terms"],
    ["Classes & subjects", stats.classes > 0 && stats.subjects > 0, "/school/classes"],
    ["Students", stats.students > 0, "/school/students"],
    ["Staff accounts", stats.activatedNonOwnerStaff > 0 && stats.pendingStaff === 0, "/school/settings/access"],
    ["Fee structure", stats.feeItems > 0, "/school/fees"],
    ["Report-card templates", stats.reportTemplates > 0, "/school/report-cards"],
  ] as const;
  const completed = setup.filter(([, done]) => done).length;
  const progress = Math.round((completed / setup.length) * 100);
  const attention = [
    stats.pendingReportCards > 0 ? { label: "Report cards awaiting approval", detail: `${stats.pendingReportCards} submitted report${stats.pendingReportCards === 1 ? "" : "s"} need review.`, href: "/school/report-cards", tone: "review" } : null,
    stats.pendingFeeAdjustments > 0 ? { label: "Fee adjustments awaiting approval", detail: `${stats.pendingFeeAdjustments} adjustment${stats.pendingFeeAdjustments === 1 ? "" : "s"} need a second person to approve.`, href: "/school/fees/overview", tone: "finance" } : null,
    stats.pendingStaff > 0 ? { label: "Staff accounts waiting for activation", detail: `${stats.pendingStaff} account${stats.pendingStaff === 1 ? "" : "s"} still need access setup.`, href: "/school/settings/access", tone: "people" } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; href: string; tone: string }>;

  return (
    <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]} 👋`} subtitle={`${school} · ${code} · ${role}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
      <div className="admin-command-center">
        <section className="admin-command-hero">
          <div><span className="admin-eyebrow">School command centre</span><h1>Your school, organised around what needs action.</h1><p>See readiness, approvals, people and core school activity without hunting through separate modules.</p></div>
          <div className="admin-hero-actions"><Link className="admin-primary-action" href="/school/settings">Open school settings</Link><Link className="admin-secondary-action" href="/school/reports">View reports</Link></div>
        </section>
        <section className="admin-command-grid">
          <article className="admin-readiness-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Setup readiness</span><h2>Get the school ready</h2><p>{completed} of {setup.length} essentials are configured.</p></div><strong className="admin-progress-value">{progress}%</strong></div><div className="admin-progress-track"><span style={{ width: `${progress}%` }} /></div><div className="admin-setup-list">{setup.map(([label, done, href]) => <Link key={label} href={href} className={`admin-setup-row ${done ? "is-done" : "is-open"}`}><span>{done ? "✓" : "○"}</span><div><strong>{label}</strong><small>{done ? "Configured" : "Needs attention"}</small></div>{!done && <b>Fix →</b>}</Link>)}</div></article>
          <article className="admin-attention-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Needs your attention</span><h2>Important work</h2><p>Approval and activation queues already waiting in your school.</p></div></div>{attention.length ? <div className="admin-attention-list">{attention.map((item) => <Link href={item.href} key={item.label} className={`admin-attention-row tone-${item.tone}`}><span className="admin-attention-mark">!</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><b>Open →</b></Link>)}</div> : <div className="admin-clear-state"><span>✓</span><div><strong>Nothing urgent right now.</strong><p>Approval queues and account activations are clear.</p></div></div>}</article>
        </section>
        <section className="admin-section-block"><div className="admin-section-head"><div><span className="admin-eyebrow">School snapshot</span><h2>The numbers that matter every day.</h2></div><Link href="/school/reports">Full reports →</Link></div><div className="admin-stat-grid">{quickStats.map(([label, key, href]) => <Link href={href} key={key} className="admin-stat-card"><span>{label}</span><strong>{stats[key]}</strong><small>Open {label.toLowerCase()} →</small></Link>)}</div></section>
        <section className="admin-lower-grid">
          <article className="admin-panel-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Academic & operations</span><h2>At a glance</h2></div></div><div className="admin-metric-list">{[["Subjects",stats.subjects,"/school/subjects"],["Fee items",stats.feeItems,"/school/fees"],["Invoices",stats.invoices,"/school/fees/invoices"],["Payments",stats.payments,"/school/fees/payments"],["Attendance records",stats.attendance,"/school/attendance"],["Calendar events",stats.events,"/school/terms"]].map(([label,value,href]) => <Link href={href as string} className="admin-metric-row" key={label as string}><span>{label}</span><strong>{value}</strong><b>→</b></Link>)}</div></article>
          <article className="admin-panel-card"><div className="admin-section-head"><div><span className="admin-eyebrow">Recent communication</span><h2>Your inbox</h2></div><Link href="/school/communications/messages">Open →</Link></div>{stats.announcements.length ? <div className="admin-message-list">{stats.announcements.map((item) => <Link href="/school/communications/messages" className="admin-message-row" key={item.id}><span>✉</span><div><strong>{item.body.split("\n")[0]}</strong><small>{item.body.replace(/\n/g, " ").slice(0, 120)}</small></div></Link>)}</div> : <div className="admin-empty-state"><span>✉</span><strong>Your inbox is quiet.</strong><p>New school messages will appear here.</p></div>}</article>
        </section>
        <section className="admin-section-block admin-quick-actions"><div className="admin-section-head"><div><span className="admin-eyebrow">Quick actions</span><h2>Start the work that changes the school.</h2></div></div><div className="admin-action-grid"><Link href="/school/students"><strong>＋ Add student</strong><span>Create a new learner record.</span></Link><Link href="/school/classes"><strong>＋ Create class</strong><span>Build or update class structure.</span></Link><Link href="/school/staff"><strong>＋ Add staff</strong><span>Bring another member into the school.</span></Link><Link href="/school/communications/announcements"><strong>◈ Send announcement</strong><span>Share an update with the school community.</span></Link></div></section>
      </div>
      <style>{adminCommandStyles}</style>
    </AppShell>
  );
}

const adminCommandStyles = `
.admin-command-center{display:grid;gap:18px;max-width:1480px;margin:0 auto;padding:4px 0 36px}.admin-command-hero,.admin-readiness-card,.admin-attention-card,.admin-panel-card,.admin-section-block{border:1px solid var(--sn-line,#d9e2e6);background:var(--sn-surface,#fff);border-radius:22px;box-shadow:var(--sn-shadow,0 16px 42px rgba(15,33,43,.06))}.admin-command-hero{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:28px;background:linear-gradient(135deg,var(--sn-surface,#fff),var(--sn-primary-soft,#eef7f3))}.admin-eyebrow{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:var(--sn-muted-strong,#6b7b83)}.admin-command-hero h1{max-width:760px;margin:8px 0;font-size:30px;line-height:1.08;letter-spacing:-.035em;color:var(--sn-ink,#17232b)}.admin-command-hero p,.admin-section-head p{margin:0;color:var(--sn-muted-strong,#5a6a72);font-size:11px;line-height:1.7}.admin-hero-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.admin-primary-action,.admin-secondary-action{padding:11px 14px;border-radius:11px;text-decoration:none;font-size:9px;font-weight:900}.admin-primary-action{background:var(--sn-primary,#0b9b78);color:#fff}.admin-secondary-action{background:var(--sn-surface,#fff);border:1px solid var(--sn-line,#d9e2e6);color:var(--sn-ink-2,#3c4c54)}.admin-command-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:18px}.admin-readiness-card,.admin-attention-card{padding:22px}.admin-section-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.admin-section-head h2{margin:5px 0 3px;color:var(--sn-ink,#17232b);font-size:18px;letter-spacing:-.025em}.admin-section-head>a{font-size:9px;font-weight:900;color:var(--sn-primary-deep,#087b61);text-decoration:none}.admin-progress-value{font-size:24px;color:var(--sn-primary-deep,#087b61)}.admin-progress-track{height:9px;margin:18px 0;border-radius:999px;background:var(--sn-surface-3,#e8eeee);overflow:hidden}.admin-progress-track span{display:block;height:100%;border-radius:inherit;background:var(--sn-primary,#0b9b78)}.admin-setup-list,.admin-attention-list,.admin-metric-list,.admin-message-list{display:grid;gap:7px}.admin-setup-row,.admin-attention-row,.admin-metric-row,.admin-message-row{display:flex;align-items:center;gap:11px;text-decoration:none;border:1px solid var(--sn-line,#dfe7e9);border-radius:13px;background:var(--sn-surface-2,#fbfcfc);color:var(--sn-ink,#17232b)}.admin-setup-row{padding:10px 11px}.admin-setup-row>span{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;background:#e9f7f2;color:#087b61;font-size:9px;font-weight:900}.admin-setup-row.is-open>span{background:#fff3e5;color:#a55a00}.admin-setup-row div,.admin-attention-row div,.admin-message-row div{min-width:0;flex:1}.admin-setup-row strong,.admin-attention-row strong,.admin-message-row strong{display:block;font-size:10px}.admin-setup-row small,.admin-attention-row small,.admin-message-row small{display:block;margin-top:3px;color:var(--sn-muted,#738189);font-size:8px;line-height:1.5}.admin-setup-row b,.admin-attention-row>b{font-size:8px;color:var(--sn-primary-deep,#087b61)}.admin-attention-row{padding:12px}.admin-attention-mark{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:#fff3e5;color:#a55a00;font-weight:900}.tone-finance .admin-attention-mark{background:#eef0ff;color:#5962bd}.tone-people .admin-attention-mark{background:#edf7ef;color:#2c7a4d}.admin-clear-state{display:flex;align-items:center;gap:12px;margin-top:14px;padding:18px;border-radius:14px;background:#eef9f5;border:1px solid #d6eee5}.admin-clear-state>span{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#dff3ec;color:#087b61;font-weight:900}.admin-clear-state strong{font-size:10px}.admin-clear-state p{margin:3px 0 0;color:#68777f;font-size:8px}.admin-section-block{padding:22px}.admin-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.admin-stat-card{padding:16px;text-decoration:none;border:1px solid var(--sn-line,#dfe7e9);border-radius:15px;background:var(--sn-surface-2,#fbfcfc)}.admin-stat-card span,.admin-stat-card small{display:block;color:var(--sn-muted,#74838a);font-size:8px}.admin-stat-card strong{display:block;margin:7px 0;font-size:25px;color:var(--sn-ink,#17232b)}.admin-stat-card small{color:var(--sn-primary-deep,#087b61);font-weight:850}.admin-lower-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.admin-panel-card{padding:22px}.admin-metric-row{padding:11px 0;border-bottom:1px solid var(--sn-line,#e3e9eb);background:transparent;border-radius:0;border-left:0;border-right:0;border-top:0}.admin-metric-row span{font-size:9px;color:var(--sn-muted-strong,#53636b);flex:1}.admin-metric-row strong{font-size:11px;color:var(--sn-ink,#17232b)}.admin-metric-row b{font-size:9px;color:var(--sn-primary-deep,#087b61)}.admin-message-row{padding:12px}.admin-message-row>span{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#eef7f3;color:#087b61}.admin-empty-state{text-align:center;padding:36px 18px}.admin-empty-state>span{display:grid;place-items:center;width:40px;height:40px;margin:0 auto 10px;border:1px dashed #bddbd1;border-radius:12px;color:#0b9b78}.admin-empty-state strong{display:block;font-size:11px}.admin-empty-state p{margin:5px 0 0;color:var(--sn-muted,#738189);font-size:8px}.admin-quick-actions{padding-bottom:24px}.admin-action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.admin-action-grid a{padding:15px;border:1px solid var(--sn-line,#dfe7e9);border-radius:15px;background:var(--sn-surface-2,#fbfcfc);text-decoration:none}.admin-action-grid strong{display:block;color:var(--sn-ink,#17232b);font-size:10px}.admin-action-grid span{display:block;margin-top:5px;color:var(--sn-muted,#738189);font-size:8px;line-height:1.5}@media(max-width:980px){.admin-command-hero{flex-direction:column;align-items:flex-start}.admin-hero-actions{justify-content:flex-start}.admin-command-grid,.admin-lower-grid{grid-template-columns:1fr}.admin-stat-grid,.admin-action-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.admin-stat-grid,.admin-action-grid{grid-template-columns:1fr}.admin-command-hero{padding:20px}.admin-command-hero h1{font-size:24px}.admin-readiness-card,.admin-attention-card,.admin-panel-card,.admin-section-block{padding:18px}.admin-primary-action,.admin-secondary-action{width:100%;text-align:center}}
`;
