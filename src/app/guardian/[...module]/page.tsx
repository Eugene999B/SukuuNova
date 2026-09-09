import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { CircleCheckBig, GraduationCap, UsersRound, WalletCards, ArrowRight, BookOpenCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { filterGuardianReleasedScores, getGuardianFamilyContext } from "@/lib/guardian-family-context";
import "@/app/globals.css";

type Props = { params: Promise<{ module: string[] }>; searchParams: Promise<{ studentId?: string }> };

const titles: Record<string, [string, string]> = {
  children: ["My children", "Your children."],
  attendance: ["Attendance", "Attendance for linked learners."],
  academics: ["Academics & results", "Released results and report information."],
  assignments: ["Homework", "Published academic work."],
  fees: ["Fees & receipts", "Fees and balances."],
  messages: ["Messages", "Messages."],
  calendar: ["Calendar", "Events."]
};

const guardianVisibleReportStatuses = { in: ["approved", "sent"] };
function scopedHref(route: string, studentId?: string | null) { return studentId ? `/guardian/${route}?studentId=${encodeURIComponent(studentId)}` : `/guardian/${route}`; }

export default async function GuardianModulePage({ params, searchParams }: Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const parts = (await params).module;
  const route = parts.join("/");
  const childId = parts[0] === "children" && parts[1] ? parts[1] : null;
  const requestedStudentId = childId ?? (await searchParams).studentId ?? null;

  const data = await withTenant(session.schoolId, async (tx) => {
    const family = await getGuardianFamilyContext(tx, {
      schoolId: session.schoolId,
      guardianId: session.guardianId,
      userId: session.userId,
      studentId: requestedStudentId,
    });
    const ids = family.selectedChild ? [family.selectedChild.id] : family.children.map((child) => child.id);
    const children = ids.length ? await tx.student.findMany({
      where: { id: { in: ids }, schoolId: session.schoolId },
      orderBy: { name: "asc" },
      include: {
        class: true,
        attendanceEvents: { orderBy: { attendanceDate: "desc" }, take: 100 },
        scores: { include: { subject: true, assessment: true }, orderBy: { enteredAt: "desc" } },
        reportCards: { where: { status: guardianVisibleReportStatuses }, select: { id: true, termId: true, status: true } },
        invoices: { include: { payments: { include: { reversals: true } } } }
      }
    }) : [];
    return { family, children };
  });

  const titleBase = childId ? data.children[0]?.name : titles[route]?.[0];
  const subtitleBase = childId ? `Protected learner view · ${data.children[0]?.admissionNo ?? ""}` : titles[route]?.[1];
  if (!titleBase || !subtitleBase || (childId && !data.children[0])) notFound();
  const selectedChild = data.family.selectedChild;
  const title = !childId && selectedChild ? `${titleBase} · ${selectedChild.name}` : titleBase;
  const subtitle = !childId && selectedChild ? `${subtitleBase} Showing ${selectedChild.name} only.` : subtitleBase;

  const visibleScores = (student: typeof data.children[number]) => filterGuardianReleasedScores(student.scores, student.reportCards);
  const totalAttendance = data.children.reduce((n, s) => n + s.attendanceEvents.length, 0);
  const totalResults = data.children.reduce((n, s) => n + visibleScores(s).length, 0);
  const netPaid = (payments: Array<{ amount: unknown; reversals: Array<{ amount: unknown }> }>) =>
    payments.reduce(
      (sum, payment) => sum.plus(new Prisma.Decimal(String(payment.amount))).minus(
        payment.reversals.reduce((r, row) => r.plus(new Prisma.Decimal(String(row.amount))), new Prisma.Decimal(0))
      ),
      new Prisma.Decimal(0)
    );
  const invoiceDue = (invoice: { totalAmount: unknown; payments: Array<{ amount: unknown; reversals: Array<{ amount: unknown }> }> }) =>
    new Prisma.Decimal(String(invoice.totalAmount)).minus(netPaid(invoice.payments));
  const totalBalance = data.children.reduce(
    (n, s) => n.plus(s.invoices.reduce((sum, inv) => sum.plus(invoiceDue(inv)), new Prisma.Decimal(0))),
    new Prisma.Decimal(0)
  );
  const activeLabel = childId ? "My Children" : route === "assignments" ? "Academics" : route === "fees" ? "Fees & Receipts" : route === "messages" ? "Messages" : route === "attendance" ? "Attendance" : route === "academics" ? "Academics" : "My Children";

  return (
    <AppShell universe="guardian" title={title} subtitle={subtitle} active={activeLabel} schoolName={session.schoolName} userName={data.family.guardian.name} role="Guardian">
      {!childId && ["attendance","academics","assignments","fees"].includes(route) && data.family.children.length > 1 ? (
        <section className="sn-list-card" style={{marginBottom:16}} aria-label="Choose child context">
          <header className="sn-list-card-head"><div><h2>Family view</h2><p>Switch learner context without mixing one child’s records with another.</p></div><span className="app-pill">{selectedChild ? selectedChild.name : "All children"}</span></header>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 14px 14px"}}>
            <Link className="module-hero-button" href={`/guardian/${route}`}>All children</Link>
            {data.family.children.map((child) => <Link key={child.id} className="module-hero-button" href={scopedHref(route, child.id)}>{child.name}</Link>)}
          </div>
        </section>
      ) : null}

      <div className="app-grid kpis">
        {route === "attendance" ? <DataCard label="Attendance" value={totalAttendance} meta={selectedChild ? `Recorded activity for ${selectedChild.name}` : "Recorded activity across linked children"} icon={CircleCheckBig} />
        : route === "academics" || route === "assignments" ? <DataCard label="Released results" value={totalResults} meta={selectedChild ? `Visible records for ${selectedChild.name}` : "Published records across linked children"} icon={GraduationCap} />
        : route === "fees" || childId ? <DataCard label="Outstanding" value={`GH₵${totalBalance.toFixed(2)}`} meta={selectedChild ? `Live balance for ${selectedChild.name}` : "Live invoice balances"} icon={WalletCards} />
        : <DataCard label="Children" value={data.children.length} meta="Relationship-scoped" icon={UsersRound} />}
      </div>

      {childId ? (
        <section className="sn-list-card" style={{marginTop:16}}>
          <header className="sn-list-card-head"><div><h2>{data.children[0].name}</h2><p>{data.children[0].admissionNo} · {data.children[0].class?.name ?? "Unassigned"}</p></div><span className="app-pill">Connected learner</span></header>
          <div className="sn-list-card-body">
            <div className="app-list-row"><span className="app-list-icon"><CircleCheckBig size={15}/></span><div><b>Attendance</b><span>{data.children[0].attendanceEvents.length} recent recorded events</span></div></div>
            <div className="app-list-row"><span className="app-list-icon"><GraduationCap size={15}/></span><div><b>Academic records</b><span>{visibleScores(data.children[0]).length} released scores · {data.children[0].reportCards.length} published report cards</span></div></div>
            <div className="app-list-row"><span className="app-list-icon"><WalletCards size={15}/></span><div><b>Fees</b><span>GH₵{data.children[0].invoices.reduce((sum, inv) => sum.plus(invoiceDue(inv)), new Prisma.Decimal(0)).toFixed(2)} outstanding</span></div></div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 0 14px"}}>
              <Link className="module-hero-button" href={scopedHref("attendance", data.children[0].id)}>Attendance</Link>
              <Link className="module-hero-button" href={scopedHref("academics", data.children[0].id)}>Results</Link>
              <Link className="module-hero-button" href={`/guardian/academic?studentId=${encodeURIComponent(data.children[0].id)}`}>Assignments & notes</Link>
              <Link className="module-hero-button" href={scopedHref("fees", data.children[0].id)}>Fees</Link>
            </div>
          </div>
        </section>
      ) : data.children.length ? (
        <section className="sn-list-card" style={{marginTop:16}}>
          <header className="sn-list-card-head"><div><h2>{title}</h2><p>{selectedChild ? "This view is locked to the selected linked learner." : "Choose a learner for a child-specific view."}</p></div>{route==="academics"?<Link className="module-hero-button" href={selectedChild?`/guardian/academic?studentId=${encodeURIComponent(selectedChild.id)}`:"/guardian/academic"}><BookOpenCheck size={14}/> Assignments & notes</Link>:null}</header>
          <div className="sn-list-card-body">{data.children.map((student) => {
            const scoreCount=visibleScores(student).length;
            const balance=student.invoices.reduce((sum,inv)=>sum.plus(invoiceDue(inv)),new Prisma.Decimal(0));
            const detail=route==="attendance"?`${student.attendanceEvents.length} recent attendance events`:route==="academics"||route==="assignments"?`${scoreCount} released score records · ${student.reportCards.length} published reports`:route==="fees"?`GH₵${balance.toFixed(2)} outstanding`:`${student.admissionNo} · ${student.class?.name ?? "Unassigned"}`;
            return <Link key={student.id} href={`/guardian/children/${student.id}`} className="app-list-row" style={{textDecoration:"none"}}><span className="app-list-icon"><UsersRound size={15}/></span><div><b>{student.name}</b><span>{detail}</span></div><ArrowRight size={15}/></Link>;
          })}</div>
        </section>
      ) : (
        <div style={{marginTop:16}}><EmptyState icon={UsersRound} title="No linked learner records yet" description="Your school must connect a learner to this guardian account before family information appears here." /></div>
      )}
    </AppShell>
  );
}
