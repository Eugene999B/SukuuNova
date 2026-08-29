import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/app/globals.css";

type Props = { params: Promise<{ module: string[] }> };

const titles: Record<string, [string, string]> = {
  children: ["My children", "Learners connected to your guardian account."],
  attendance: ["Attendance", "Attendance activity for your connected children."],
  academics: ["Academics & results", "Published academic results and assessment history."],
  assignments: ["Homework", "Learning work and exercises assigned by the school."],
  fees: ["Fees & receipts", "School invoices, payments and outstanding balances."],
  messages: ["Messages", "School communication available to your guardian account."],
  calendar: ["Calendar", "Upcoming school events and important dates."]
};

const guardianVisibleReportStatuses = { in: ["approved", "sent"] };

export default async function GuardianModulePage({ params }: Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const parts = (await params).module;
  const route = parts.join("/");
  const childId = parts[0] === "children" && parts[1] ? parts[1] : null;

  const data = await withTenant(session.schoolId, async (tx) => {
    const guardian = await tx.guardian.findFirst({
      where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
      select: { name: true, students: { select: { studentId: true, relationship: true, isPrimary: true } } }
    });
    if (!guardian) return null;
    const ids = guardian.students.map((x) => x.studentId);
    if (childId) {
      if (!ids.includes(childId)) return { guardian, child: null, children: [] };
      const child = await tx.student.findFirst({
        where: { id: childId, schoolId: session.schoolId },
        include: {
          class: true,
          attendanceEvents: true,
          scores: {
            where: {
              assessment: {
                term: {
                  reportCards: { some: { studentId: childId, status: guardianVisibleReportStatuses } }
                }
              }
            },
            include: { subject: true, assessment: true }
          },
          reportCards: { where: { status: guardianVisibleReportStatuses } },
          invoices: { include: { payments: true } }
        }
      });
      return { guardian, child, children: [] };
    }
    const children = await tx.student.findMany({
      where: { id: { in: ids }, schoolId: session.schoolId },
      orderBy: { name: "asc" },
      include: {
        class: true,
        attendanceEvents: true,
        scores: {
          where: {
            assessment: {
              term: {
                reportCards: { some: { status: guardianVisibleReportStatuses } }
              }
            }
          },
          include: { subject: true, assessment: true }
        },
        reportCards: { where: { status: guardianVisibleReportStatuses } },
        invoices: { include: { payments: true } }
      }
    });
    return { guardian, child: null, children };
  });

  if (!data) redirect("/login/guardian");
  if (childId && !data.child) notFound();

  const title = childId ? data.child!.name : titles[route]?.[0];
  const subtitle = childId ? `Protected learner view · ${data.child!.admissionNo}` : titles[route]?.[1];
  if (!title || !subtitle) notFound();

  const childData = data.child ? [data.child] : data.children;
  const totalAttendance = childData.reduce((n, s) => n + s.attendanceEvents.length, 0);
  const totalResults = childData.reduce((n, s) => n + s.scores.length, 0);
  const totalBalance = childData.reduce((n, s) => n + s.invoices.reduce((sum, inv) => sum + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0), 0);
  const links = ["children", "attendance", "academics", "assignments", "fees", "messages", "calendar"];

  return <main className="app-shell app-shell-school"><aside className="app-sidebar"><Link href="/guardian" className="app-brand"><span className="app-brand-mark">S</span><span><strong>SukuuNova</strong><small>Guardian Portal</small></span></Link><div className="app-school-chip"><span className="app-chip-avatar">{data.guardian.name.slice(0,2).toUpperCase()}</span><span><b>{data.guardian.name}</b><small>{session.schoolName}</small></span></div><nav className="app-nav" aria-label="Guardian navigation"><div className="app-nav-group"><div className="app-nav-label">Family</div>{links.map((item) => <Link key={item} className={`app-nav-item ${route===item ? "is-active" : ""}`} href={`/guardian/${item}`}><span className="app-nav-icon">{item==="children"?"♟":item==="attendance"?"◉":item==="academics"?"◇":item==="assignments"?"✦":item==="fees"?"₵":item==="messages"?"✉":"◷"}</span><span>{item==="children"?"My children":item==="academics"?"Academics & results":item==="assignments"?"Homework":item==="fees"?"Fees & receipts":item[0].toUpperCase()+item.slice(1)}</span></Link>)}<Link className="app-nav-item" href="/account/security"><span className="app-nav-icon">⚙</span><span>Security</span></Link></div></nav><div className="app-sidebar-bottom"><form action="/api/auth/guardian/logout" method="post"><button className="app-help" type="submit">Sign out</button></form></div></aside><section className="app-main"><header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> {session.schoolName}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="app-top-actions"><Link className="app-search" href="/guardian/children">♟ {childData.length} connected</Link></div></header><div className="app-content">
    <div className="app-grid kpis"><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Children</span><span className="app-kpi-icon">♟</span></div><div className="app-kpi-value">{childData.length}</div><div className="app-kpi-meta">Relationship-scoped</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Attendance</span><span className="app-kpi-icon">◉</span></div><div className="app-kpi-value">{totalAttendance}</div><div className="app-kpi-meta">Recorded activity</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Results</span><span className="app-kpi-icon">◇</span></div><div className="app-kpi-value">{totalResults}</div><div className="app-kpi-meta">Published records</div></div><div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Outstanding</span><span className="app-kpi-icon">₵</span></div><div className="app-kpi-value">GH₵{totalBalance.toFixed(2)}</div><div className="app-kpi-meta">Live invoice balances</div></div></div>
    {childId ? <section className="app-card" style={{padding:18,marginTop:16}}><div className="app-card-head"><div><h2>{data.child!.name}</h2><p>{data.child!.admissionNo} · {data.child!.class?.level ? `${data.child!.class.level} · ` : ""}{data.child!.class?.name ?? "Unassigned"}</p></div><span className="app-pill">Connected learner</span></div><div className="app-list" style={{marginTop:12}}><div className="app-list-row"><span className="app-list-icon">◉</span><div><b>Attendance</b><span>{data.child!.attendanceEvents.length} recorded events</span></div></div><div className="app-list-row"><span className="app-list-icon">◇</span><div><b>Academic records</b><span>{data.child!.scores.length} published scores · {data.child!.reportCards.length} published report cards</span></div></div><div className="app-list-row"><span className="app-list-icon">₵</span><div><b>Fees</b><span>GH₵{(data.child!.invoices.reduce((sum, inv) => sum + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0)).toFixed(2)} outstanding</span></div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}><Link className="module-hero-button" href="/guardian/attendance">Attendance</Link><Link className="module-hero-button" href="/guardian/academics">Academics</Link><Link className="module-hero-button" href="/guardian/fees">Fees</Link></div></section> : <section className="app-card" style={{padding:18,marginTop:16}}><div className="app-card-head"><div><h2>{title}</h2><p>Only records belonging to your guardian relationship are shown here.</p></div></div>{data.children.length ? <div style={{display:"grid",gap:10,marginTop:12}}>{data.children.map((student) => <Link key={student.id} href={`/guardian/children/${student.id}`} className="app-list-row" style={{textDecoration:"none"}}><span className="app-list-icon">♟</span><div><b>{student.name}</b><span>{student.admissionNo} · {student.class?.name ?? "Unassigned"}</span></div><span>→</span></Link>)}</div> : <div className="module-empty"><div className="module-empty-mark">◎</div><strong>No linked learner records yet</strong><p>Your school must connect a learner to this guardian account before family information appears here.</p></div>}</section>}
  </div></section></main>;
}