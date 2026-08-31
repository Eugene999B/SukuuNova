import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheckBig, GraduationCap, UsersRound, WalletCards, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
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
          scores: { where: { assessment: { term: { reportCards: { some: { studentId: childId, status: guardianVisibleReportStatuses } } } } }, include: { subject: true, assessment: true } },
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
        scores: { where: { assessment: { term: { reportCards: { some: { status: guardianVisibleReportStatuses } } } } }, include: { subject: true, assessment: true } },
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

  return (
    <AppShell universe="guardian" title={title} subtitle={subtitle} active={childId ? "My Children" : route === "assignments" ? "Academics" : route === "fees" ? "Fees & Receipts" : route === "messages" ? "Messages" : route === "attendance" ? "Attendance" : route === "academics" ? "Academics" : "My Children"} schoolName={session.schoolName} userName={data.guardian.name} role="Guardian">
      <div className="app-grid kpis">
        <DataCard label="Children" value={childData.length} meta="Relationship-scoped" icon={UsersRound} />
        <DataCard label="Attendance" value={totalAttendance} meta="Recorded activity" icon={CircleCheckBig} />
        <DataCard label="Results" value={totalResults} meta="Published records" icon={GraduationCap} />
        <DataCard label="Outstanding" value={`GH₵${totalBalance.toFixed(2)}`} meta="Live invoice balances" icon={WalletCards} />
      </div>

      {childId ? (
        <section className="sn-list-card" style={{marginTop:16}}>
          <header className="sn-list-card-head"><div><h2>{data.child!.name}</h2><p>{data.child!.admissionNo} · {data.child!.class?.name ?? "Unassigned"}</p></div><span className="app-pill">Connected learner</span></header>
          <div className="sn-list-card-body">
            <div className="app-list-row"><span className="app-list-icon"><CircleCheckBig size={15}/></span><div><b>Attendance</b><span>{data.child!.attendanceEvents.length} recorded events</span></div></div>
            <div className="app-list-row"><span className="app-list-icon"><GraduationCap size={15}/></span><div><b>Academic records</b><span>{data.child!.scores.length} published scores · {data.child!.reportCards.length} published report cards</span></div></div>
            <div className="app-list-row"><span className="app-list-icon"><WalletCards size={15}/></span><div><b>Fees</b><span>GH₵{data.child!.invoices.reduce((sum, inv) => sum + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0).toFixed(2)} outstanding</span></div></div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 0 14px"}}><Link className="module-hero-button" href="/guardian/attendance">Attendance</Link><Link className="module-hero-button" href="/guardian/academics">Academics</Link><Link className="module-hero-button" href="/guardian/fees">Fees</Link></div>
          </div>
        </section>
      ) : data.children.length ? (
        <section className="sn-list-card" style={{marginTop:16}}>
          <header className="sn-list-card-head"><div><h2>{title}</h2><p>Only records belonging to your guardian relationship are shown here.</p></div></header>
          <div className="sn-list-card-body">{data.children.map((student) => <Link key={student.id} href={`/guardian/children/${student.id}`} className="app-list-row" style={{textDecoration:"none"}}><span className="app-list-icon"><UsersRound size={15}/></span><div><b>{student.name}</b><span>{student.admissionNo} · {student.class?.name ?? "Unassigned"}</span></div><ArrowRight size={15}/></Link>)}</div>
        </section>
      ) : (
        <div style={{marginTop:16}}><EmptyState icon={UsersRound} title="No linked learner records yet" description="Your school must connect a learner to this guardian account before family information appears here." /></div>
      )}
    </AppShell>
  );
}

function DataCard({ label, value, meta, icon: Icon }: { label: string; value: React.ReactNode; meta: string; icon: typeof UsersRound }) {
  return <article className="sn-data-card"><div className="sn-data-card-top"><span className="sn-data-card-label">{label}</span><span className="sn-data-card-icon"><Icon size={16} aria-hidden="true" /></span></div><strong className="sn-data-card-value">{value}</strong><span className="sn-data-card-meta">{meta}</span></article>;
}
