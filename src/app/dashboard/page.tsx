import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { LogoutButton } from "@/components/LogoutButton";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const schoolSession = await getSchoolSession();
  if (schoolSession) {
    const account = await withTenant(schoolSession.schoolId, (tx) => tx.user.findUnique({
      where: { id: schoolSession.userId },
      select: { name: true, school: { select: { name: true, uniqueCode: true } }, userRoles: { include: { role: { select: { name: true } } } } }
    }));
    if (!account) redirect("/login/school");
    return <SchoolDashboard name={account.name} school={account.school.name} code={account.school.uniqueCode} role={account.userRoles.map(r => r.role.name).join(", ") || "Administrator"} />;
  }

  const platformSession = await getPlatformSession();
  if (platformSession) return <PlatformDashboard name={platformSession.name} role={platformSession.role} />;
  redirect("/");
}

function Kpi({ icon, label, value, meta }: { icon: string; label: string; value: string; meta: string }) {
  return <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">{label}</span><span className="app-kpi-icon">{icon}</span></div><div className="app-kpi-value">{value}</div><div className="app-kpi-meta">{meta}</div></div>;
}

function SchoolDashboard({ name, school, code, role }: { name: string; school: string; code: string; role: string }) {
  return <AppShell universe="school" title={`Good morning, ${name.split(" ")[0]} 👋`} subtitle={`${school} · ${code} · ${role} · Academic year 2026/27`} active="Overview">
    <div className="app-grid kpis">
      <Kpi icon="♟" label="Students" value="1,247" meta="+12 this term" />
      <Kpi icon="◉" label="Attendance today" value="94.5%" meta="+2.1% vs yesterday" />
      <Kpi icon="₵" label="Fees collected" value="GH₵125k" meta="+8% this month" />
      <Kpi icon="⌂" label="Active classes" value="24" meta="3 need attention" />
    </div>
    <div className="app-dashboard-grid">
      <section className="app-card app-chart"><div className="app-card-head"><div><h2>School performance</h2><p>Attendance and enrolment movement · This term</p></div><span className="app-pill">Term 1 ▾</span></div><div className="app-bars">{[74,82,69,92,86,98].map((h,i)=><div className="app-bar-col" key={i}><div className="app-bar-stack"><i className="app-bar" style={{height:`${h}%`}} /><i className="app-bar alt" style={{height:`${Math.max(24,h-22)}%`}} /></div><span className="app-bar-label">{["Aug","Sep","Oct","Nov","Dec","Jan"][i]}</span></div>)}</div></section>
      <section className="app-card app-side-widget"><div className="app-card-head"><div><h2>Today’s attendance</h2><p>All active classes</p></div><span className="app-pill">Live</span></div><div className="app-progress-row"><div><span>Present</span><b>1,164</b></div><div className="app-progress"><i style={{width:"94%"}} /></div></div><div className="app-progress-row"><div><span>Late</span><b>31</b></div><div className="app-progress"><i style={{width:"3%"}} /></div></div><div className="app-progress-row"><div><span>Absent</span><b>52</b></div><div className="app-progress"><i style={{width:"4%"}} /></div></div><div className="app-banner"><div><h3>3 classes incomplete</h3><p>Attendance registers need attention.</p></div><Link href="/phase3">Review →</Link></div></section>
    </div>
    <div className="app-lower">
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Today’s priorities</h2><p>Items that need action</p></div><span className="app-pill">5 items</span></div><div className="app-list"><div className="app-list-row"><span className="app-list-icon">₵</span><div><b>Fee balances need follow-up</b><span>12 families · GH₵8,450 outstanding</span></div><span className="app-list-value">Finance</span></div><div className="app-list-row"><span className="app-list-icon">✎</span><div><b>Admissions awaiting review</b><span>7 applications ready for approval</span></div><span className="app-list-value">Admissions</span></div><div className="app-list-row"><span className="app-list-icon">◇</span><div><b>Results ready to publish</b><span>Primary 6 · 34 learner reports</span></div><span className="app-list-value">Academics</span></div><div className="app-list-row"><span className="app-list-icon">✉</span><div><b>Parent announcement</b><span>School closure notice drafted</span></div><span className="app-list-value">Comms</span></div></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Quick actions</h2><p>Common tasks, one click away</p></div></div><div className="app-actions"><Link className="app-action" href="/mvp"><strong>＋ Add student</strong>Register a learner</Link><Link className="app-action" href="/phase3"><strong>✓ Attendance</strong>Mark today’s register</Link><Link className="app-action" href="/phase3"><strong>₵ Record payment</strong>Issue a fee receipt</Link><Link className="app-action" href="/phase2"><strong>▣ Timetable</strong>View teaching schedule</Link><Link className="app-action" href="/phase2/roles"><strong>♙ Staff & roles</strong>Manage access</Link><Link className="app-action" href="/phase4"><strong>▥ Reports</strong>School insights</Link></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>Upcoming</h2><p>Next seven days</p></div></div><div className="app-list"><div className="app-list-row"><span className="app-list-icon">◷</span><div><b>Staff meeting</b><span>Tomorrow · 8:00 AM</span></div></div><div className="app-list-row"><span className="app-list-icon">◇</span><div><b>Mid-term assessment</b><span>Thursday · JHS 2</span></div></div><div className="app-list-row"><span className="app-list-icon">⌂</span><div><b>Parent forum</b><span>Friday · 3:30 PM</span></div></div></div></section>
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="school" /></div>
  </AppShell>;
}

function PlatformDashboard({ name, role }: { name: string; role: string }) {
  return <AppShell universe="platform" title={`Control center, ${name.split(" ")[0]}`} subtitle={`SukuuNova Network · ${role} · Global operations`} active="Overview">
    <div className="app-grid kpis"><Kpi icon="⌂" label="Schools" value="86" meta="+4 this month" /><Kpi icon="♟" label="Learners managed" value="42.8k" meta="Across the network" /><Kpi icon="◉" label="Platform uptime" value="99.98%" meta="Last 30 days" /><Kpi icon="!" label="Open support" value="12" meta="3 high priority" /></div>
    <div className="app-dashboard-grid"><section className="app-card app-chart"><div className="app-card-head"><div><h2>Network growth</h2><p>Active schools and learner growth</p></div><span className="app-pill">Last 6 months</span></div><div className="app-bars">{[48,58,64,72,84,95].map((h,i)=><div className="app-bar-col" key={i}><div className="app-bar-stack"><i className="app-bar" style={{height:`${h}%`}} /><i className="app-bar alt" style={{height:`${h-15}%`}} /></div><span className="app-bar-label">{["Mar","Apr","May","Jun","Jul","Aug"][i]}</span></div>)}</div></section><section className="app-card app-side-widget"><div className="app-card-head"><div><h2>System health</h2><p>Live platform services</p></div><span className="app-pill">All systems</span></div><div className="app-progress-row"><div><span>Application</span><b>100%</b></div><div className="app-progress"><i style={{width:"100%"}} /></div></div><div className="app-progress-row"><div><span>Database</span><b>99.99%</b></div><div className="app-progress"><i style={{width:"99%"}} /></div></div><div className="app-progress-row"><div><span>Messaging</span><b>99.7%</b></div><div className="app-progress"><i style={{width:"97%"}} /></div></div></section></div>
    <div className="app-lower"><section className="app-card app-panel"><div className="app-card-head"><div><h2>Operations queue</h2><p>Network items requiring attention</p></div></div><div className="app-list"><div className="app-list-row"><span className="app-list-icon">⌂</span><div><b>4 new schools awaiting onboarding</b><span>Verify documents and provision workspaces</span></div></div><div className="app-list-row"><span className="app-list-icon">!</span><div><b>3 high-priority support cases</b><span>Assigned to platform operations</span></div></div><div className="app-list-row"><span className="app-list-icon">₵</span><div><b>8 subscriptions due for review</b><span>Billing and renewal queue</span></div></div></div></section><section className="app-card app-panel"><div className="app-card-head"><div><h2>Platform actions</h2><p>Frequent administration tasks</p></div></div><div className="app-actions"><Link className="app-action" href="/platform/schools/new"><strong>＋ Onboard school</strong>Create workspace</Link><Link className="app-action" href="/platform"><strong>⌕ Find school</strong>Search network</Link><Link className="app-action" href="/platform"><strong>◇ Support</strong>Review tickets</Link><Link className="app-action" href="/platform"><strong>▥ Reports</strong>Platform insights</Link></div></section><section className="app-card app-panel"><div className="app-card-head"><div><h2>Recent activity</h2><p>Latest platform events</p></div></div><div className="app-list"><div className="app-list-row"><span className="app-list-icon">✓</span><div><b>New school onboarded</b><span>4 minutes ago</span></div></div><div className="app-list-row"><span className="app-list-icon">◈</span><div><b>Plan upgraded</b><span>18 minutes ago</span></div></div><div className="app-list-row"><span className="app-list-icon">⌁</span><div><b>Support case resolved</b><span>41 minutes ago</span></div></div></div></section></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><LogoutButton universe="platform" /></div>
  </AppShell>;
}
