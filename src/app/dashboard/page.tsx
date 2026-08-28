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
  const setup = [["School profile",true,"/school/settings"],["Add your first student",stats.students>0,"/school/students"],["Create your classes",stats.classes>0,"/school/classes"],["Add subjects",stats.subjects>0,"/school/subjects"],["Configure school fees",stats.feeItems>0,"/school/fees"]] as const;
  const completed = setup.filter(([,done])=>done).length;
  const hasData = stats.students+stats.guardians+stats.staff+stats.classes+stats.subjects+stats.feeItems+stats.invoices+stats.payments+stats.attendance+stats.events>0;
  return <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]} 👋`} subtitle={`${school} · ${code} · ${role}`} active="Overview" schoolName={school} schoolCode={code} userName={name} role={role}>
    <div className="app-grid kpis">
      <Kpi icon="♟" label="Students" value={String(stats.students)} meta={stats.students?"Live school records":"No students added yet"}/>
      <Kpi icon="⌂" label="Classes" value={String(stats.classes)} meta={stats.classes?"Active school classes":"Create your first class"}/>
      <Kpi icon="♧" label="Guardians" value={String(stats.guardians)} meta={stats.guardians?"Live family records":"No guardians added yet"}/>
      <Kpi icon="♙" label="Staff accounts" value={String(stats.staff)} meta={stats.staff?"Accounts in this school":"No additional staff yet"}/>
    </div>
    <div className="app-dashboard-grid">
      <section className="app-card app-chart"><div className="app-card-head"><div><h2>{hasData?"School snapshot":"Your school workspace is ready"}</h2><p>{hasData?"Live record counts from this school":"Start adding your real school information — nothing is fabricated here."}</p></div><span className="app-pill">Live</span></div>{hasData?<div className="app-bars">{[stats.students,stats.classes,stats.subjects,stats.guardians,stats.invoices,stats.payments].map((value,i)=>{const labels=["Students","Classes","Subjects","Guardians","Invoices","Payments"];const max=Math.max(stats.students,stats.classes,stats.subjects,stats.guardians,stats.invoices,stats.payments,1);const height=Math.max(8,Math.round(value/max*100));return <Link className="app-bar-col" href={i===0?"/school/students":i===1?"/school/classes":i===2?"/school/subjects":i===3?"/school/guardians":i===4?"/school/fees/invoices":"/school/fees/payments"} key={labels[i]}><div className="app-bar-stack"><i className="app-bar" style={{height:`${height}%`}}/></div><span className="app-bar-label">{labels[i]}</span></Link>;})}</div>:<div className="app-empty-hero"><div className="app-empty-orb">S</div><h3>Build your school, one step at a time.</h3><p>Students, classes, subjects, fees and attendance will appear here automatically as you enter them.</p><Link className="app-primary-action" href="/school/students">Add first student →</Link></div>}</section>
      <section className="app-card app-side-widget"><div className="app-card-head"><div><h2>Communication pulse</h2><p>Announcements delivered inside the school portal</p></div><span className="app-pill">{stats.announcements.length?"New":"Ready"}</span></div>{stats.announcements.length?<div className="app-list">{stats.announcements.map((item)=><div className="app-list-row" key={item.id}><span className="app-list-icon">◈</span><div><b>{item.body.split("\n")[0]}</b><span>{item.body.split("\n").slice(2).join(" ").slice(0,110)}</span></div></div>)}</div>:<div className="app-banner"><div><h3>No announcements yet</h3><p>Use the Communication centre for school-wide, role-targeted or individual updates.</p></div><Link href="/school/communications/announcements">Create →</Link></div>}</section>
    </div>
    <div className="app-lower">
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>School setup</h2><p>{completed} of {setup.length} essentials completed</p></div><span className="app-pill">{Math.round(completed/setup.length*100)}%</span></div><div className="app-list">{setup.map(([label,done,href])=><div className="app-list-row" key={label}><span className="app-list-icon">{done?"✓":"○"}</span><div><b>{label}</b><span>{done?"Completed":"Ready for setup"}</span></div><Link className="app-list-value" href={href}>{done?"Open":"Start →"}</Link></div>)}</div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Quick actions</h2><p>Go straight to the work you need</p></div></div><div className="app-actions"><Link className="app-action" href="/school/students"><strong>＋ Add student</strong>Create a learner record</Link><Link className="app-action" href="/school/classes"><strong>＋ Create class</strong>Set up a class group</Link><Link className="app-action" href="/school/subjects"><strong>＋ Add subject</strong>Build the curriculum</Link><Link className="app-action" href="/school/fees"><strong>₵ School fees</strong>Configure fees and charges</Link><Link className="app-action" href="/school/attendance"><strong>✓ Attendance</strong>Mark a register</Link><Link className="app-action" href="/school/communications/announcements"><strong>◈ Announcement</strong>Reach staff or guardians</Link></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>School activity</h2><p>Only real records will appear here</p></div></div><div className="app-list"><div className="app-list-row"><span className="app-list-icon">◇</span><div><b>Subjects</b><span>{stats.subjects} configured</span></div></div><div className="app-list-row"><span className="app-list-icon">₵</span><div><b>Finance</b><span>{stats.invoices} invoices · {stats.payments} payments</span></div></div><div className="app-list-row"><span className="app-list-icon">◷</span><div><b>Calendar</b><span>{stats.events} events</span></div></div></div></section>
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="school"/></div>
  </AppShell>;
}

function PlatformDashboard({ name, role }: { name:string; role:string }) { return <AppShell universe="platform" title={`Control center, ${name.split(" ")[0]}`} subtitle={`SukuuNova Network · ${role} · Global operations`} active="Overview" userName={name} role={role}><div className="app-grid kpis"><Kpi icon="⌂" label="Schools" value="0" meta="No network data"/><Kpi icon="♟" label="Learners managed" value="0" meta="No network data"/><Kpi icon="◉" label="Platform uptime" value="—" meta="Live monitoring coming online"/><Kpi icon="!" label="Open support" value="0" meta="No support records"/></div><div className="app-card app-panel"><div className="app-card-head"><div><h2>Platform control center</h2><p>Network operations will populate from real SukuuNova records.</p></div></div><div className="app-empty-hero"><div className="app-empty-orb">S</div><h3>Platform workspace ready.</h3><p>Onboard a school to begin building the network.</p><Link className="app-primary-action" href="/platform/schools/new">Onboard a school →</Link></div></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="platform"/></div></AppShell>; }
