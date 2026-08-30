import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { LogoutButton } from "@/components/LogoutButton";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (schoolSession) {
    const overview = await withTenant(schoolSession.schoolId, async (tx) => {
      const [account, access] = await Promise.all([
        tx.user.findUnique({ where: { id: schoolSession.userId }, select: { name: true, school: { select: { name: true, uniqueCode: true } } } }),
        getSchoolAuthorization(tx, schoolSession.userId)
      ]);
      return { account, access };
    });

    if (!overview.account) redirect("/login/school");
    if (overview.access.workspace === "teacher") redirect("/teacher");
    const roleNames = overview.access.roles.map((role) => role.name);

    const schoolOverview = await withTenant(schoolSession.schoolId, async (tx) => {
      const [students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements] = await Promise.all([
        tx.student.count(), tx.guardian.count(), tx.user.count(), tx.class.count(), tx.subject.count(), tx.feeItem.count(), tx.invoice.count(), tx.payment.count(), tx.attendanceEvent.count(), tx.calendarEvent.count(),
        tx.message.findMany({ where: { recipientId: schoolSession.userId, channel: "in_app" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, body: true, createdAt: true } }),
      ]);
      return { students, guardians, staff, classes, subjects, feeItems, invoices, payments, attendance, events, announcements };
    });
    const role = roleNames.join(", ") || "Administrator";
    return <SchoolDashboard name={overview.account.name} school={overview.account.school.name} code={overview.account.school.uniqueCode} role={role} stats={schoolOverview} />;
  }

  const platformSession = await getPlatformSession();
  if (platformSession) return <PlatformDashboard name={platformSession.name} role={platformSession.role} />;
  redirect("/");
}

type AnnouncementPreview = { id: string; body: string; createdAt: Date }[];
type SchoolStats = { students:number; guardians:number; staff:number; classes:number; subjects:number; feeItems:number; invoices:number; payments:number; attendance:number; events:number; announcements:AnnouncementPreview };
const overviewMetrics = [["♟", "Students", "students"], ["⌂", "Classes", "classes"], ["▤", "Subjects", "subjects"], ["♧", "Guardians", "guardians"], ["₵", "Invoices", "invoices"], ["↙", "Payments", "payments"]] as const;
function Kpi({ icon, label, value, meta }: { icon:string; label:string; value:string; meta:string }) { return <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">{label}</span><span className="app-kpi-icon">{icon}</span></div><div className="app-kpi-value">{value}</div><div className="app-kpi-meta">{meta}</div></div>; }
function SchoolDashboard({ name, school, code, role, stats }: { name:string; school:string; code:string; role:string; stats:SchoolStats }) {
  const setup = [["School profile",true],["Students",stats.students>0],["Classes",stats.classes>0],["Subjects",stats.subjects>0],["Fee setup",stats.feeItems>0]] as const;
  const completed = setup.filter(([,done])=>done).length;
  const values = overviewMetrics.map(([, , key]) => stats[key]);
  const max = Math.max(...values,1);
  const totalTracked = values.reduce((sum,value)=>sum+value,0);
  const setupPercent = Math.round(completed/setup.length*100);
  return <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]} 👋`} subtitle={`${school} · ${code} · ${role}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
    <div className="overview-workspace">
      <section className="overview-welcome"><div><span className="overview-kicker">School command centre</span><h2>Everything important, at a glance.</h2><p>Your current school snapshot brings people, academics, attendance and finance into one view.</p></div><div className="overview-live"><i/>Current school data</div></section>
      <section className="overview-kpi-grid" aria-label="School totals">{overviewMetrics.slice(0,4).map(([icon,label,key])=><Kpi key={key} icon={icon} label={label} value={String(stats[key])} meta={stats[key] ? "Current total" : "Ready for records"}/>)}</section>
      <section className="overview-stat-layout"><section className="overview-stat-card"><div className="overview-section-head"><div><span className="overview-kicker">School statistics</span><h3>What is happening across the school?</h3><p>Current totals from the records already in this school.</p></div><div className="overview-total"><strong>{totalTracked}</strong><span>tracked records</span></div></div><div className="overview-chart" role="img" aria-label="Current school record counts">{overviewMetrics.map(([icon,label,key])=>{const value=stats[key]; const height=value?Math.max(12,Math.round(value/max*100)):7; return <div className={`overview-bar-column ${value===0?"is-zero":""}`} key={key}><div className="overview-bar-value">{value}</div><div className="overview-bar-track"><i style={{height:`${height}%`}}/></div><span className="overview-bar-icon">{icon}</span><b>{label}</b></div>;})}</div><div className="overview-chart-foot"><span><i className="legend-dot active"/>Current records</span><span><i className="legend-dot empty"/>An area becomes active as records are added</span></div></section><section className="overview-glance-card"><div className="overview-section-head compact"><div><span className="overview-kicker">At a glance</span><h3>Operating pulse</h3></div><span className="overview-pulse">Current</span></div><div className="overview-glance-list">{[['Attendance records',stats.attendance,'Recorded'],['Calendar events',stats.events,'Scheduled'],['Fee items',stats.feeItems,'Configured'],['Invoices',stats.invoices,'Issued'],['Payments',stats.payments,'Recorded']].map(([label,value,meta])=><div className="overview-glance-row" key={label as string}><span className="overview-row-icon">{String(label).charAt(0)}</span><div><b>{label}</b><small>{meta}</small></div><strong>{value}</strong></div>)}</div><div className="overview-pulse-note"><span>✦</span><div><strong>One school picture</strong><p>These totals stay connected to the underlying records, so the dashboard grows with the school.</p></div></div></section></section>
      <section className="overview-lower-grid"><section className="app-card app-panel overview-setup"><div className="app-card-head"><div><span className="overview-kicker">Setup progress</span><h2>Get the school ready</h2><p>{completed} of {setup.length} essentials configured</p></div><div className="overview-progress"><span>{setupPercent}%</span><i style={{"--progress":`${setupPercent}%`} as React.CSSProperties}/></div></div><div className="app-list">{setup.map(([label,done])=><div className="app-list-row" key={label}><span className="app-list-icon">{done?"✓":"○"}</span><div><b>{label}</b><span>{done?"Configured":"Not configured"}</span></div></div>)}</div></section><section className="app-card app-panel"><div className="app-card-head"><div><span className="overview-kicker">Recent communication</span><h2>What needs your attention?</h2><p>Latest messages addressed to this account.</p></div></div>{stats.announcements.length?<div className="app-list">{stats.announcements.map((item)=><div className="app-list-row" key={item.id}><span className="app-list-icon">◈</span><div><b>{item.body.split("\n")[0]}</b><span>{item.body.split("\n").slice(2).join(" ").slice(0,110)}</span></div></div>)}</div>:<div className="overview-empty-message"><div className="empty-message-icon">✉</div><div><strong>Your inbox is quiet.</strong><p>New school messages will appear here as they arrive.</p></div></div>}</section><section className="app-card app-panel overview-actions"><div className="app-card-head"><div><span className="overview-kicker">Quick actions</span><h2>Do something now</h2><p>Jump straight into the work that changes school records.</p></div></div><div className="app-actions"><Link className="app-action" href="/school/students"><strong>＋ Add student</strong>New learner record</Link><Link className="app-action" href="/school/classes"><strong>＋ Create class</strong>New class group</Link><Link className="app-action" href="/school/attendance"><strong>✓ Attendance</strong>Mark a register</Link><Link className="app-action" href="/school/communications/announcements"><strong>◈ Announcement</strong>Send an update</Link></div></section></section>
    </div>
  </AppShell>;
}
function PlatformDashboard({ name, role }: { name:string; role:string }) { return <AppShell universe="platform" title={`Control center, ${name.split(" ")[0]}`} subtitle={`SukuuNova Network · ${role} · Global operations`} active="Overview" userName={name} role={role}><div className="app-grid kpis"><Kpi icon="⌂" label="Schools" value="0" meta="No network data"/><Kpi icon="♟" label="Learners managed" value="0" meta="No network data"/><Kpi icon="◉" label="Platform uptime" value="—" meta="Monitoring not connected"/><Kpi icon="!" label="Open support" value="0" meta="No support records"/></div><div className="app-card app-panel"><div className="app-card-head"><div><h2>Platform statistics</h2><p>Network operations populate this area as platform data becomes available.</p></div></div><div className="app-empty-hero"><div className="app-empty-orb">S</div><h3>Platform workspace is ready.</h3><p>No network statistics are available yet.</p><Link className="app-primary-action" href="/platform/schools/new">Onboard a school →</Link></div></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="platform"/></div></AppShell>; }