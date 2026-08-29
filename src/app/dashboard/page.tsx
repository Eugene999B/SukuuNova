import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { LogoutButton } from "@/components/LogoutButton";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (schoolSession) {
    const overview = await withTenant(schoolSession.schoolId, async (tx) => {
      const [account, students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements] = await Promise.all([
        tx.user.findUnique({ where: { id: schoolSession.userId }, select: { name: true, school: { select: { name: true, uniqueCode: true } }, userRoles: { include: { role: { select: { name: true } } } } } }),
        tx.student.count(), tx.guardian.count(), tx.user.count(), tx.class.count(), tx.subject.count(), tx.feeItem.count(), tx.invoice.count(), tx.payment.count(), tx.attendanceEvent.count(), tx.calendarEvent.count(),
        tx.message.findMany({ where: { recipientId: schoolSession.userId, channel: "in_app" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, body: true, createdAt: true } })
      ]);
      return { account, students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements };
    });

    if (!overview.account) redirect("/login/school");
    const role = overview.account.userRoles.map((r) => r.role.name).join(", ") || "Administrator";
    return <SchoolDashboard name={overview.account.name} school={overview.account.school.name} code={overview.account.school.uniqueCode} role={role} stats={overview} />;
  }

  const platformSession = await getPlatformSession();
  if (platformSession) return <PlatformDashboard name={platformSession.name} role={platformSession.role} />;
  redirect("/");
}

type AnnouncementPreview = { id: string; body: string; createdAt: Date }[];
type SchoolStats = { students:number; guardians:number; staff:number; classes:number; subjects:number; feeItems:number; invoices:number; payments:number; attendance:number; events:number; announcements:AnnouncementPreview };

function Kpi({ icon, label, value, meta }: { icon:string; label:string; value:string; meta:string }) { return <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">{label}</span><span className="app-kpi-icon">{icon}</span></div><div className="app-kpi-value">{value}</div><div className="app-kpi-meta">{meta}</div></div>; }

function SchoolDashboard({ name, school, code, role, stats }: { name:string; school:string; code:string; role:string; stats:SchoolStats }) {
  const setup = [["School profile",true],["Students",stats.students>0],["Classes",stats.classes>0],["Subjects",stats.subjects>0],["Fee setup",stats.feeItems>0]] as const;
  const completed = setup.filter(([,done])=>done).length;
  const values = [stats.students,stats.classes,stats.subjects,stats.guardians,stats.invoices,stats.payments];
  const labels = ["Students","Classes","Subjects","Guardians","Invoices","Payments"];
  const max = Math.max(...values,1);
  const hasData = values.some((v)=>v>0) || stats.attendance>0 || stats.events>0;
  return <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]} 👋`} subtitle={`${school} · ${code} · ${role}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
    <div className="app-grid kpis">
      <Kpi icon="♟" label="Students" value={String(stats.students)} meta={stats.students?"Live school count":"No records yet"}/>
      <Kpi icon="⌂" label="Classes" value={String(stats.classes)} meta={stats.classes?"Live school count":"No records yet"}/>
      <Kpi icon="♧" label="Guardians" value={String(stats.guardians)} meta={stats.guardians?"Live family count":"No records yet"}/>
      <Kpi icon="♙" label="Staff accounts" value={String(stats.staff)} meta={stats.staff?"Live account count":"No records yet"}/>
    </div>
    <div className="app-dashboard-grid">
      <section className="app-card app-chart"><div className="app-card-head"><div><h2>School statistics</h2><p>Current record counts across the school workspace.</p></div><span className="app-pill">Live data</span></div>{hasData?<div className="app-bars">{values.map((value,i)=>{const height=Math.max(8,Math.round(value/max*100));return <div className="app-bar-col" key={labels[i]} aria-label={`${labels[i]}: ${value}`}><div className="app-bar-stack"><i className="app-bar" style={{height:`${height}%`}}/></div><span className="app-bar-label">{labels[i]}</span><strong className="app-bar-value">{value}</strong></div>;})}</div>:<div className="app-empty-hero"><div className="app-empty-orb">S</div><h3>No school statistics yet.</h3><p>The overview will populate automatically as real students, classes, subjects, finance and attendance records are added.</p></div>}</section>
      <section className="app-card app-side-widget"><div className="app-card-head"><div><h2>At a glance</h2><p>Operational totals for this school.</p></div></div><div className="app-stat-list"><div><span>Subjects</span><strong>{stats.subjects}</strong></div><div><span>Invoices</span><strong>{stats.invoices}</strong></div><div><span>Payments</span><strong>{stats.payments}</strong></div><div><span>Attendance records</span><strong>{stats.attendance}</strong></div><div><span>Calendar events</span><strong>{stats.events}</strong></div></div></section>
    </div>
    <div className="app-lower">
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Setup progress</h2><p>{completed} of {setup.length} essentials configured</p></div><span className="app-pill">{Math.round(completed/setup.length*100)}%</span></div><div className="app-list">{setup.map(([label,done])=><div className="app-list-row" key={label}><span className="app-list-icon">{done?"✓":"○"}</span><div><b>{label}</b><span>{done?"Configured":"Not configured"}</span></div></div>)}</div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Recent communication</h2><p>Latest messages addressed to this account.</p></div></div>{stats.announcements.length?<div className="app-list">{stats.announcements.map((item)=><div className="app-list-row" key={item.id}><span className="app-list-icon">◈</span><div><b>{item.body.split("\n")[0]}</b><span>{item.body.split("\n").slice(2).join(" ").slice(0,110)}</span></div></div>)}</div>:<div className="app-banner"><div><h3>No recent communication</h3><p>Your overview will show real school messages here.</p></div></div>}</section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Actions</h2><p>Only the work entry points live here.</p></div></div><div className="app-actions"><Link className="app-action" href="/school/students"><strong>＋ Add student</strong>New learner record</Link><Link className="app-action" href="/school/classes"><strong>＋ Create class</strong>New class group</Link><Link className="app-action" href="/school/attendance"><strong>✓ Attendance</strong>Mark a register</Link><Link className="app-action" href="/school/communications/announcements"><strong>◈ Announcement</strong>Send an update</Link></div></section>
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="school"/></div>
  </AppShell>;
}

function PlatformDashboard({ name, role }: { name:string; role:string }) { return <AppShell universe="platform" title={`Control center, ${name.split(" ")[0]}`} subtitle={`SukuuNova Network · ${role} · Global operations`} active="Overview" userName={name} role={role}><div className="app-grid kpis"><Kpi icon="⌂" label="Schools" value="0" meta="No network data"/><Kpi icon="♟" label="Learners managed" value="0" meta="No network data"/><Kpi icon="◉" label="Platform uptime" value="—" meta="Live monitoring coming online"/><Kpi icon="!" label="Open support" value="0" meta="No support records"/></div><div className="app-card app-panel"><div className="app-card-head"><div><h2>Platform statistics</h2><p>Network operations will populate from real SukuuNova records.</p></div></div><div className="app-empty-hero"><div className="app-empty-orb">S</div><h3>Platform workspace ready.</h3><p>Network statistics will appear as schools are onboarded.</p><Link className="app-primary-action" href="/platform/schools/new">Onboard a school →</Link></div></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="platform"/></div></AppShell>; }
