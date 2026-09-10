import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowRight, BookOpenCheck, CalendarCheck2, CheckCircle2, CircleDollarSign, Clock3, GraduationCap, ReceiptText, TrendingUp, UserRound, UsersRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { filterGuardianReleasedScores, getGuardianFamilyContext } from "@/lib/guardian-family-context";
import "@/app/globals.css";
import "../guardian-modules-v2.css";

type Props = { params: Promise<{ module: string[] }>; searchParams: Promise<{ studentId?: string }> };
type AttendanceRow = { id:string; type:string; method:string; attendanceDate:Date };
type ScoreRow = { id:string; value:Prisma.Decimal; assessment:{ termId:string; maxScore:Prisma.Decimal }; subject:{ name:string } };
type ReportRow = { id:string; termId:string; status:string };
type PaymentRow = { amount:Prisma.Decimal; reversals:Array<{ amount:Prisma.Decimal }> };
type InvoiceRow = { totalAmount:Prisma.Decimal; payments:PaymentRow[] };
type ModuleStudent = {
  id:string; name:string; admissionNo:string; photoUrl:string|null;
  class:{ name:string; level:string|null }|null;
  attendanceEvents:AttendanceRow[]; scores:ScoreRow[]; reportCards:ReportRow[]; invoices:InvoiceRow[];
};
type FinanceSummary = { billed:Prisma.Decimal; paid:Prisma.Decimal; outstanding:Prisma.Decimal; paymentCount:number; invoiceCount:number; collection:number };
type AcademicSummary = { scores:ScoreRow[]; average:number|null; latest:ScoreRow|undefined; reports:number };
type AttendanceSummary = { incoming:AttendanceRow[]; outgoing:AttendanceRow[]; days:number; latest:AttendanceRow|undefined; total:number };
type AvatarStudent = { name:string; photoUrl?:string|null };

const titles: Record<string, [string, string]> = {
  children: ["My children", "Identity, learning, attendance and balances for every linked learner."],
  attendance: ["Attendance", "A clear family timeline instead of raw attendance counts."],
  academics: ["Academics & results", "Released results, report cards and learning progress by child."],
  assignments: ["Homework", "Published academic work and learner activity."],
  fees: ["Fees & receipts", "Billed, paid and outstanding amounts broken down by learner."],
  messages: ["Messages", "Family communication with the school."],
  calendar: ["Calendar", "School events and important dates."],
};
const guardianVisibleReportStatuses = { in: ["approved", "sent"] };
const scopedHref = (route:string, studentId?:string|null) => studentId ? `/guardian/${route}?studentId=${encodeURIComponent(studentId)}` : `/guardian/${route}`;
const money = (value: Prisma.Decimal) => `GH₵${value.toFixed(2)}`;
const dayKey = (value: Date) => value.toISOString().slice(0,10);

export default async function GuardianModulePage({ params, searchParams }: Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const parts = (await params).module;
  const route = parts.join("/");
  const childId = parts[0] === "children" && parts[1] ? parts[1] : null;
  const requestedStudentId = childId ?? (await searchParams).studentId ?? null;

  const data = await withTenant(session.schoolId, async (tx) => {
    const family = await getGuardianFamilyContext(tx, { schoolId:session.schoolId, guardianId:session.guardianId, userId:session.userId, studentId:requestedStudentId });
    const familyIds = family.children.map(child => child.id);
    const ids = family.selectedChild ? [family.selectedChild.id] : familyIds;
    const include = {
      class: true,
      attendanceEvents: { orderBy: { attendanceDate: "desc" as const }, take: 100 },
      scores: { include: { subject: true, assessment: true }, orderBy: { enteredAt: "desc" as const } },
      reportCards: { where: { status: guardianVisibleReportStatuses }, select: { id:true, termId:true, status:true } },
      invoices: { include: { payments: { include: { reversals:true } } } },
    };
    const [children, familyCards] = await Promise.all([
      ids.length ? tx.student.findMany({ where:{id:{in:ids},schoolId:session.schoolId}, orderBy:{name:"asc"}, include }) : [],
      familyIds.length ? tx.student.findMany({ where:{id:{in:familyIds},schoolId:session.schoolId}, orderBy:{name:"asc"}, select:{id:true,name:true,admissionNo:true,photoUrl:true,class:{select:{name:true,level:true}}} }) : [],
    ]);
    return { family, children, familyCards };
  });

  const titleBase = childId ? data.children[0]?.name : titles[route]?.[0];
  const subtitleBase = childId ? `Connected learner · ${data.children[0]?.admissionNo ?? ""}` : titles[route]?.[1];
  if (!titleBase || !subtitleBase || (childId && !data.children[0])) notFound();
  const selectedChild = data.family.selectedChild;
  const title = !childId && selectedChild ? `${titleBase} · ${selectedChild.name}` : titleBase;
  const subtitle = !childId && selectedChild ? `${subtitleBase} Showing ${selectedChild.name} only.` : subtitleBase;

  const visibleScores = (student: ModuleStudent) => filterGuardianReleasedScores(student.scores, student.reportCards);
  const netPaid = (payments:PaymentRow[]) => payments.reduce((sum,payment)=>sum.plus(payment.amount).minus(payment.reversals.reduce((reversed,row)=>reversed.plus(row.amount),new Prisma.Decimal(0))),new Prisma.Decimal(0));
  const studentFinance = (student:ModuleStudent):FinanceSummary => {
    const billed=student.invoices.reduce((sum,invoice)=>sum.plus(invoice.totalAmount),new Prisma.Decimal(0));
    const paid=student.invoices.reduce((sum,invoice)=>sum.plus(netPaid(invoice.payments)),new Prisma.Decimal(0));
    const outstanding=billed.minus(paid);
    const paymentCount=student.invoices.reduce((count,invoice)=>count+invoice.payments.length,0);
    return {billed,paid,outstanding,paymentCount,invoiceCount:student.invoices.length,collection:billed.gt(0)?Math.max(0,Math.min(100,Number(paid.div(billed).mul(100).toFixed(0)))):100};
  };
  const studentAcademic = (student:ModuleStudent):AcademicSummary => {
    const scores=visibleScores(student);
    const percentages=scores.map(score=>Number(score.assessment.maxScore)>0?Number(score.value)/Number(score.assessment.maxScore)*100:0);
    const average=percentages.length?percentages.reduce((sum,value)=>sum+value,0)/percentages.length:null;
    return {scores,average,latest:scores[0],reports:student.reportCards.length};
  };
  const studentAttendance = (student:ModuleStudent):AttendanceSummary => {
    const incoming=student.attendanceEvents.filter(event=>event.type==="in");
    const outgoing=student.attendanceEvents.filter(event=>event.type==="out");
    const days=new Set(incoming.map(event=>dayKey(event.attendanceDate))).size;
    return {incoming,outgoing,days,latest:student.attendanceEvents[0],total:student.attendanceEvents.length};
  };

  const typedChildren:ModuleStudent[] = data.children;
  const finances=typedChildren.map(studentFinance);
  const totalBilled=finances.reduce((sum,row)=>sum.plus(row.billed),new Prisma.Decimal(0));
  const totalPaid=finances.reduce((sum,row)=>sum.plus(row.paid),new Prisma.Decimal(0));
  const totalBalance=finances.reduce((sum,row)=>sum.plus(row.outstanding),new Prisma.Decimal(0));
  const collection=totalBilled.gt(0)?Math.max(0,Math.min(100,Number(totalPaid.div(totalBilled).mul(100).toFixed(0)))):100;
  const totalResults=typedChildren.reduce((sum,student)=>sum+visibleScores(student).length,0);
  const totalReports=typedChildren.reduce((sum,student)=>sum+student.reportCards.length,0);
  const totalAttendanceDays=typedChildren.reduce((sum,student)=>sum+studentAttendance(student).days,0);
  const totalCheckins=typedChildren.reduce((sum,student)=>sum+studentAttendance(student).incoming.length,0);
  const activeLabel=childId?"My Children":route==="assignments"?"Academics":route==="fees"?"Fees & Receipts":route==="messages"?"Messages":route==="attendance"?"Attendance":route==="academics"?"Academics":"My Children";

  const metric = (label:string,value:string|number,detail:string,icon:ReactNode,meter?:number) => <article className="gmv-kpi"><div className="gmv-kpi-head"><span>{label}</span>{icon}</div><strong>{value}</strong><p>{detail}</p>{meter!==undefined?<div className="gmv-meter"><span style={{width:`${meter}%`}}/></div>:null}</article>;
  const avatar = (student:AvatarStudent) => <span className="gmv-avatar">{student.photoUrl?<Image src={student.photoUrl} width={50} height={50} alt="" unoptimized/>:student.name.slice(0,2).toUpperCase()}</span>;

  return <AppShell universe="guardian" title={title} subtitle={subtitle} active={activeLabel} schoolName={session.schoolName} userName={data.family.guardian.name} role="Guardian">
    <div className="gmv-page">
      <section className="gmv-hero"><div><span className="gmv-hero-kicker">FAMILY COMMAND CENTER</span><h1>{title}</h1><p>{subtitle} Every number below is scoped to learners linked to this guardian account.</p></div><div className="gmv-hero-badge"><strong>{selectedChild?"1":data.familyCards.length}</strong><span>{selectedChild?"learner in focus":"linked learners"}</span></div></section>

      {!childId&&["attendance","academics","assignments","fees"].includes(route)&&data.familyCards.length>1?<nav className="gmv-family-switcher" aria-label="Choose learner"><Link className={!selectedChild?"active":""} href={`/guardian/${route}`}><span className="gmv-all-icon"><UsersRound size={16}/></span><div><strong>All children</strong><small>Combined family view</small></div></Link>{data.familyCards.map(child=><Link key={child.id} className={selectedChild?.id===child.id?"active":""} href={scopedHref(route,child.id)}>{avatar(child)}<div><strong>{child.name}</strong><small>{child.class?.name||"Class not set"} · {child.admissionNo}</small></div></Link>)}</nav>:null}

      {route==="attendance"?<section className="gmv-kpis">{metric("Check-ins",totalCheckins,"Recent IN events across the selected family scope.",<CheckCircle2 size={16}/>)}{metric("Recorded days",totalAttendanceDays,"Distinct recent school days with a check-in.",<CalendarCheck2 size={16}/>)}{metric("Learners",typedChildren.length,"Children represented by this attendance view.",<UsersRound size={16}/>)}{metric("Activity window",typedChildren.reduce((sum,s)=>sum+s.attendanceEvents.length,0),"Recent IN/OUT events available for review.",<Clock3 size={16}/>)}</section>:route==="fees"?<section className="gmv-kpis">{metric("Total billed",money(totalBilled),`${typedChildren.reduce((sum,s)=>sum+s.invoices.length,0)} invoices in this family view.`,<ReceiptText size={16}/>)}{metric("Net paid",money(totalPaid),"Posted payments less recorded reversals.",<CircleDollarSign size={16}/>)}{metric("Outstanding",money(totalBalance),"Current balance still due across selected learners.",<WalletCards size={16}/>)}{metric("Collection",`${collection}%`,"Share of billed value covered by net payments.",<TrendingUp size={16}/>,collection)}</section>:route==="academics"||route==="assignments"?<section className="gmv-kpis">{metric("Released scores",totalResults,"Score records visible only from released report terms.",<GraduationCap size={16}/>)}{metric("Published reports",totalReports,"Report cards currently released to this family.",<BookOpenCheck size={16}/>)}{metric("Learners",typedChildren.length,"Linked children represented in this view.",<UsersRound size={16}/>)}{metric("Learning workspace","Open","Homework, notes, attempts and feedback live in the activity studio.",<ArrowRight size={16}/>)}</section>:null}

      {childId&&typedChildren[0]?<LearnerCard student={typedChildren[0]} finance={studentFinance(typedChildren[0])} academic={studentAcademic(typedChildren[0])} attendance={studentAttendance(typedChildren[0])}/>:route==="attendance"?<AttendanceView students={typedChildren} attendance={studentAttendance} avatar={avatar}/>:route==="fees"?<FeesView students={typedChildren} finance={studentFinance} avatar={avatar}/>:route==="academics"||route==="assignments"?<AcademicView students={typedChildren} academic={studentAcademic} avatar={avatar}/>:<ChildrenView students={typedChildren} finance={studentFinance} academic={studentAcademic} attendance={studentAttendance} avatar={avatar}/>} 
    </div>
  </AppShell>;
}

function AttendanceView({students,attendance,avatar}:{students:ModuleStudent[];attendance:(student:ModuleStudent)=>AttendanceSummary;avatar:(student:AvatarStudent)=>ReactNode}){
  return <section className="gmv-section"><div className="gmv-section-head"><div><span>ATTENDANCE TIMELINE</span><h2>Who checked in, and when?</h2><p>Readable child cards and recent event history replace the old raw event counter.</p></div></div>{students.length?<div className="gmv-child-grid">{students.map(student=>{const stats=attendance(student);return <article className="gmv-child-card" key={student.id}><div className="gmv-child-head">{avatar(student)}<div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.name||"Class not set"}</p></div></div><div className="gmv-child-stats"><div><span>Check-ins</span><strong>{stats.incoming.length}</strong></div><div><span>School days</span><strong>{stats.days}</strong></div><div><span>Latest</span><strong>{stats.latest?stats.latest.type.toUpperCase():"—"}</strong></div></div><div className="gmv-timeline">{student.attendanceEvents.slice(0,4).map(event=><div className="gmv-event" key={event.id}><span className="gmv-event-icon">{event.type==="in"?<CheckCircle2 size={15}/>:<ArrowRight size={15}/>}</span><div><strong>{event.type==="in"?"Checked in":"Checked out"}</strong><p>{new Date(event.attendanceDate).toLocaleDateString("en-GH",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</p></div><span>{event.method?event.method.replaceAll("_"," "):"Recorded"}</span></div>)}</div><div className="gmv-actions"><Link href={`/guardian/children/${student.id}`}>Full learner view <ArrowRight size={12}/></Link></div></article>})}</div>:<Empty/>}</section>;
}
function FeesView({students,finance,avatar}:{students:ModuleStudent[];finance:(student:ModuleStudent)=>FinanceSummary;avatar:(student:AvatarStudent)=>ReactNode}){
  return <section className="gmv-section"><div className="gmv-section-head"><div><span>FEE INTELLIGENCE</span><h2>Breakdown by learner</h2><p>See what was billed, what has actually been paid, reversals, remaining balance and payment coverage.</p></div></div>{students.length?<div className="gmv-fee-grid">{students.map(student=>{const row=finance(student);return <article className="gmv-fee-row" key={student.id}><div className="gmv-fee-student">{avatar(student)}<div><strong>{student.name}</strong><div className="gmv-meter"><span style={{width:`${row.collection}%`}}/></div></div></div><div className="gmv-fee-cell"><span>Billed</span><strong>{money(row.billed)}</strong></div><div className="gmv-fee-cell"><span>Paid</span><strong>{money(row.paid)}</strong></div><div className="gmv-fee-cell"><span>Outstanding</span><strong>{money(row.outstanding)}</strong></div><div className="gmv-fee-cell"><span>Records</span><strong>{row.invoiceCount} invoices · {row.paymentCount} payments</strong></div><Link href={`/guardian/children/${student.id}`}>Details <ArrowRight size={12}/></Link></article>})}</div>:<Empty/>}</section>;
}
function AcademicView({students,academic,avatar}:{students:ModuleStudent[];academic:(student:ModuleStudent)=>AcademicSummary;avatar:(student:AvatarStudent)=>ReactNode}){
  return <section className="gmv-section"><div className="gmv-section-head"><div><span>ACADEMIC PULSE</span><h2>Results that lead somewhere</h2><p>Released results stay protected per child, with a direct path into assignments, notes, attempts and feedback.</p></div><Link href="/guardian/academic">Open activity studio <BookOpenCheck size={13}/></Link></div><div className="gmv-fee-grid">{students.map(student=>{const row=academic(student);return <article className="gmv-academic-row" key={student.id}><div className="gmv-fee-student">{avatar(student)}<div><strong>{student.name}</strong><small style={{display:"block",color:"var(--sn-muted)",fontSize:9}}>{student.class?.name||"Class not set"}</small></div></div><div className="gmv-fee-cell"><span>Average</span><strong>{row.average===null?"—":`${row.average.toFixed(1)}%`}</strong></div><div className="gmv-fee-cell"><span>Released scores</span><strong>{row.scores.length}</strong></div><div className="gmv-fee-cell"><span>Reports</span><strong>{row.reports}</strong></div><Link href={`/guardian/academic?studentId=${encodeURIComponent(student.id)}`}>Open learning <ArrowRight size={12}/></Link></article>})}</div></section>;
}
function ChildrenView({students,finance,academic,attendance,avatar}:{students:ModuleStudent[];finance:(student:ModuleStudent)=>FinanceSummary;academic:(student:ModuleStudent)=>AcademicSummary;attendance:(student:ModuleStudent)=>AttendanceSummary;avatar:(student:AvatarStudent)=>ReactNode}){
  return <section className="gmv-section"><div className="gmv-section-head"><div><span>YOUR CHILDREN</span><h2>Family learner profiles</h2><p>Each card keeps identity, attendance, learning and fees together without mixing siblings.</p></div></div>{students.length?<div className="gmv-child-grid">{students.map(student=>{const fin=finance(student),acad=academic(student),att=attendance(student);return <article className="gmv-child-card" key={student.id}><div className="gmv-child-head">{avatar(student)}<div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.level?`${student.class.level} · `:""}{student.class?.name||"Class not set"}</p></div></div><div className="gmv-child-stats"><div><span>Attendance</span><strong>{att.days} recent days</strong></div><div><span>Academic</span><strong>{acad.average===null?"No release":`${acad.average.toFixed(1)}% avg`}</strong></div><div><span>Balance</span><strong>{money(fin.outstanding)}</strong></div></div><div className="gmv-actions"><Link className="primary" href={`/guardian/children/${student.id}`}>Open profile <ArrowRight size={12}/></Link><Link href={scopedHref("attendance",student.id)}>Attendance</Link><Link href={`/guardian/academic?studentId=${encodeURIComponent(student.id)}`}>Learning</Link><Link href={scopedHref("fees",student.id)}>Fees</Link></div></article>})}</div>:<Empty/>}</section>;
}
function LearnerCard({student,finance,academic,attendance}:{student:ModuleStudent;finance:FinanceSummary;academic:AcademicSummary;attendance:AttendanceSummary}){
  return <><section className="gmv-kpis">{metricLocal("Attendance",`${attendance.days} days`,`${attendance.incoming.length} recent check-ins`,<CalendarCheck2 size={16}/>)}{metricLocal("Released average",academic.average===null?"—":`${academic.average.toFixed(1)}%`,`${academic.scores.length} visible score records`,<GraduationCap size={16}/>)}{metricLocal("Outstanding",money(finance.outstanding),`${finance.invoiceCount} invoices · ${finance.paymentCount} payments`,<WalletCards size={16}/>,finance.collection)}{metricLocal("Report cards",academic.reports,"Released to this guardian account",<BookOpenCheck size={16}/>)}</section><section className="gmv-section"><div className="gmv-section-head"><div><span>LEARNER ACTIONS</span><h2>{student.name}</h2><p>{student.admissionNo} · {student.class?.name||"Class not set"}</p></div></div><div className="gmv-actions"><Link className="primary" href={scopedHref("attendance",student.id)}>Attendance</Link><Link href={`/guardian/academic?studentId=${encodeURIComponent(student.id)}`}>Assignments & notes</Link><Link href={scopedHref("academics",student.id)}>Results</Link><Link href={scopedHref("fees",student.id)}>Fees & receipts</Link></div></section></>;
}
function metricLocal(label:string,value:string|number,detail:string,icon:ReactNode,meter?:number){return <article className="gmv-kpi"><div className="gmv-kpi-head"><span>{label}</span>{icon}</div><strong>{value}</strong><p>{detail}</p>{meter!==undefined?<div className="gmv-meter"><span style={{width:`${meter}%`}}/></div>:null}</article>}
function Empty(){return <div className="gmv-empty"><UserRound size={22}/><strong>No learner records in this view</strong><p>Your school must link an active learner to this guardian account first.</p></div>}
