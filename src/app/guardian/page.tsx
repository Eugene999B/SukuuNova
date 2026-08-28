import Link from "next/link";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "../app-shell.css";

const db = new PrismaClient();

export default async function GuardianPortalPage() {
  const session = await requireGuardianSession();
  const guardian = await db.guardian.findFirst({
    where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
    select: {
      name: true,
      phone: true,
      user: { select: { email: true } },
      students: { include: { student: { include: { class: true, attendanceEvents: true, scores: { include: { assessment: true, subject: true } }, invoices: { include: { payments: true, term: true } } } } } }
    }
  });
  if (!guardian) redirect("/login/guardian");
  if (session.needsPasswordChange) redirect("/account/security?required=1");

  const children = guardian.students.map((link) => link.student);
  return <main className="app-shell app-shell-school" style={{ minHeight: "100vh" }}>
    <aside className="app-sidebar">
      <Link href="/" className="app-brand"><span className="app-brand-mark">S</span><span><strong>SukuuNova</strong><small>Guardian Portal</small></span></Link>
      <div className="app-school-chip"><span className="app-chip-avatar">{guardian.name.slice(0, 2).toUpperCase()}</span><span><b>{guardian.name}</b><small>{session.schoolName}</small></span></div>
      <nav className="app-nav" aria-label="Guardian navigation">
        <div className="app-nav-group"><div className="app-nav-label">Family</div>
          <Link className="app-nav-item is-active" href="/guardian"><span className="app-nav-icon">⌂</span><span>Overview</span></Link>
          <Link className="app-nav-item" href="/guardian/children"><span className="app-nav-icon">♟</span><span>My children</span></Link>
          <Link className="app-nav-item" href="/guardian/attendance"><span className="app-nav-icon">◉</span><span>Attendance</span></Link>
          <Link className="app-nav-item" href="/guardian/academics"><span className="app-nav-icon">◇</span><span>Academics & results</span></Link>
          <Link className="app-nav-item" href="/guardian/assignments"><span className="app-nav-icon">✦</span><span>Homework</span></Link>
          <Link className="app-nav-item" href="/guardian/fees"><span className="app-nav-icon">₵</span><span>Fees & receipts</span></Link>
          <Link className="app-nav-item" href="/guardian/messages"><span className="app-nav-icon">✉</span><span>Messages</span></Link>
          <Link className="app-nav-item" href="/guardian/calendar"><span className="app-nav-icon">◷</span><span>Calendar</span></Link>
          <Link className="app-nav-item" href="/account/security"><span className="app-nav-icon">⚙</span><span>Security</span></Link>
        </div>
      </nav>
      <div className="app-sidebar-bottom"><form action="/api/auth/guardian/logout" method="post"><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold" type="submit">Sign out</button></form></div>
    </aside>
    <section className="app-main"><header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> {session.schoolName}</div><h1>Family dashboard</h1><p>One secure view of the children connected to your guardian account.</p></div><div className="app-top-actions"><Link className="app-search" href="/guardian/children"><span>♟</span> {children.length} connected child{children.length === 1 ? "" : "ren"}</Link></div></header>
      <div className="app-content">
        <section className="app-card" style={{ padding: 24, marginBottom: 16 }}><div className="app-card-head"><div><h2>Good to see you, {guardian.name.split(" ")[0]}.</h2><p>{children.length === 0 ? "Your school has not connected a learner yet." : "Select a learner below to monitor their school journey."}</p></div><span className="app-pill">Guardian</span></div></section>
        <div className="app-grid kpis">
          <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Children</span><span className="app-kpi-icon">♟</span></div><div className="app-kpi-value">{children.length}</div><div className="app-kpi-meta">Only school-linked learners</div></div>
          <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Attendance records</span><span className="app-kpi-icon">◉</span></div><div className="app-kpi-value">{children.reduce((n, s) => n + s.attendanceEvents.length, 0)}</div><div className="app-kpi-meta">Across your children</div></div>
          <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Results recorded</span><span className="app-kpi-icon">◇</span></div><div className="app-kpi-value">{children.reduce((n, s) => n + s.scores.length, 0)}</div><div className="app-kpi-meta">Verified school scores</div></div>
          <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Open balances</span><span className="app-kpi-icon">₵</span></div><div className="app-kpi-value">GH₵{children.reduce((n, s) => n + s.invoices.reduce((m, inv) => m + Number(inv.amount), 0) - s.invoices.reduce((m, inv) => m + inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0), 0).toFixed(0)}</div><div className="app-kpi-meta">Calculated from student invoices</div></div>
        </div>
        <section className="app-card" style={{ padding: 18 }}><div className="app-card-head"><div><h2>Your children</h2><p>Each card is a separate secure learner view.</p></div></div><div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))" }}>{children.map((student) => { const latest = [...student.scores].sort((a,b) => Number(b.assessment?.createdAt ?? 0) - Number(a.assessment?.createdAt ?? 0))[0]; const balance = student.invoices.reduce((n, inv) => n + Number(inv.amount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0); return <article key={student.id} className="app-card" style={{ padding: 16 }}><div style={{ display: "flex", gap: 12, alignItems: "center" }}><div style={{ width: 54, height: 54, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,.06)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>{student.photoUrl ? <img src={student.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{student.name.slice(0,2).toUpperCase()}</span>}</div><div><h3 style={{ margin: 0 }}>{student.name}</h3><p style={{ margin: "4px 0 0", color: "#71898e", fontSize: 11 }}>{student.admissionNo} · {student.class?.level ? `${student.class.level} · ` : ""}{student.class?.name ?? "Unassigned"}</p></div></div><div className="app-list" style={{ marginTop: 14 }}><div className="app-list-row"><span className="app-list-icon">◇</span><div><b>Latest result</b><span>{latest ? `${latest.subject.name} · ${latest.value}` : "No result published"}</span></div></div><div className="app-list-row"><span className="app-list-icon">◉</span><div><b>Attendance activity</b><span>{student.attendanceEvents.length} recorded event{student.attendanceEvents.length === 1 ? "" : "s"}</span></div></div><div className="app-list-row"><span className="app-list-icon">₵</span><div><b>Outstanding</b><span>GH₵{balance.toFixed(2)}</span></div></div></div><Link href={`/guardian/children/${student.id}`} className="app-primary-action" style={{ display: "inline-flex", marginTop: 14 }}>Open learner view →</Link></article>; })}</div></section>
      </div></section>
  </main>;
}
