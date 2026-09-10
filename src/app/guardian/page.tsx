import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowRight, BellRing, BookOpen, BusFront, CalendarCheck2, CheckCircle2, CircleDollarSign, Gamepad2, GraduationCap, MessageSquareText, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/app/globals.css";
import "./guardian-dashboard-v2.css";

const PUBLISHED_REPORT_STATES = ["approved", "sent"] as const;
function localDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(value);
  return `${parts.find((part)=>part.type==="year")?.value}-${parts.find((part)=>part.type==="month")?.value}-${parts.find((part)=>part.type==="day")?.value}`;
}
function objectValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export default async function GuardianPortalPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const data = await withTenant(session.schoolId, async (tx) => {
    const [settings, messages, guardian] = await Promise.all([
      tx.schoolSettings.findUnique({ where:{schoolId:session.schoolId}, select:{timezone:true} }),
      tx.message.findMany({ where:{schoolId:session.schoolId,recipientType:"user",recipientId:session.userId,channel:"in_app"}, orderBy:{createdAt:"desc"}, take:100, select:{id:true,templateVariables:true} }),
      tx.guardian.findFirst({
        where:{id:session.guardianId,schoolId:session.schoolId,userId:session.userId},
        select:{ name:true, students:{ include:{ student:{ include:{
          class:true,
          attendanceEvents:{orderBy:{attendanceDate:"desc"},take:100},
          scores:{include:{assessment:true,subject:true},orderBy:{enteredAt:"desc"}},
          reportCards:{where:{status:{in:[...PUBLISHED_REPORT_STATES]}},select:{termId:true}},
          invoices:{include:{payments:{include:{reversals:true}}}},
        } } } } },
      }),
    ]);
    return { timezone:settings?.timezone||"Africa/Accra", messages, guardian };
  });
  if (!data.guardian) redirect("/login/guardian");

  const children=data.guardian.students.map(link=>link.student);
  const today=localDate(new Date(),data.timezone);
  const visibleScores=(student:typeof children[number])=>{const terms=new Set(student.reportCards.map(report=>report.termId));return student.scores.filter(score=>terms.has(score.assessment.termId));};
  const netPaid=(payments:Array<{amount:unknown;reversals:Array<{amount:unknown}>}>)=>payments.reduce((sum,payment)=>sum.plus(new Prisma.Decimal(String(payment.amount))).minus(payment.reversals.reduce((reversed,row)=>reversed.plus(new Prisma.Decimal(String(row.amount))),new Prisma.Decimal(0))),new Prisma.Decimal(0));
  const balanceFor=(student:typeof children[number])=>student.invoices.reduce((sum,invoice)=>sum.plus(new Prisma.Decimal(String(invoice.totalAmount))).minus(netPaid(invoice.payments)),new Prisma.Decimal(0));
  const averageFor=(student:typeof children[number])=>{const scores=visibleScores(student);if(!scores.length)return null;return scores.reduce((sum,score)=>sum+(Number(score.assessment.maxScore)>0?Number(score.value)/Number(score.assessment.maxScore)*100:0),0)/scores.length;};
  const attendanceToday=(student:typeof children[number])=>student.attendanceEvents.filter(event=>localDate(event.attendanceDate,data.timezone)===today);
  const familyBalance=children.reduce((sum,student)=>sum.plus(balanceFor(student)),new Prisma.Decimal(0));
  const attendanceRecorded=children.filter(student=>attendanceToday(student).length>0).length;
  const publishedReports=children.reduce((sum,student)=>sum+student.reportCards.length,0);
  const unreadMessages=data.messages.filter(message=>typeof objectValue(message.templateVariables).readAt!=="string").length;
  const familyCoverage=children.length?Math.round(attendanceRecorded/children.length*100):0;

  const priorities:Array<{tone:"warn"|"good"|"critical";title:string;detail:string;href:string;label:string;icon:React.ReactNode}>=[];
  if(!children.length)priorities.push({tone:"critical",title:"No learner is linked",detail:"The school must connect this guardian account to at least one active learner.",href:"/guardian/children",label:"Check learners",icon:<UsersRound size={16}/>});
  if(children.length&&attendanceRecorded<children.length)priorities.push({tone:"warn",title:"Attendance needs a look",detail:`${children.length-attendanceRecorded} linked learner${children.length-attendanceRecorded===1?"":"s"} do not yet show an attendance event today.`,href:"/guardian/attendance",label:"Open attendance",icon:<CalendarCheck2 size={16}/>});
  if(familyBalance.gt(0))priorities.push({tone:"warn",title:"Outstanding balance",detail:`${familyBalance.toFixed(2)} Ghana cedis remains across the current family account.`,href:"/guardian/fees",label:"See breakdown",icon:<CircleDollarSign size={16}/>});
  if(unreadMessages>0)priorities.push({tone:"warn",title:`${unreadMessages} unread school message${unreadMessages===1?"":"s"}`,detail:"Read the latest school communication without leaving the family portal.",href:"/guardian/messages",label:"Open inbox",icon:<BellRing size={16}/>});
  if(publishedReports>0)priorities.push({tone:"good",title:"Released academic reports available",detail:`${publishedReports} report card${publishedReports===1?"":"s"} can be reviewed across your linked learners.`,href:"/guardian/academics",label:"Review academics",icon:<GraduationCap size={16}/>});
  if(!priorities.length)priorities.push({tone:"good",title:"Family account is clear",detail:"There are no immediate attendance, balance or message items requiring attention in this view.",href:"/guardian/academic",label:"Open learning",icon:<ShieldCheck size={16}/>});

  const firstName=data.guardian.name.split(/\s+/)[0]||data.guardian.name;
  return <AppShell universe="guardian" title="Family overview" subtitle="A live command center for every linked learner." active="Overview" schoolName={session.schoolName} schoolCode="" userName={data.guardian.name} role="Guardian">
    <div className="gd2">
      <section className="gd2-hero"><div className="gd2-hero-copy"><span>GUARDIAN COMMAND CENTER</span><h1>Welcome back, {firstName}. Know what matters before you start clicking.</h1><p>Attendance, learning, released results, balances and school communication are summarized here, then separated cleanly by child when you need detail.</p><div className="gd2-hero-actions"><Link className="gd2-button primary" href={children[0]?`/guardian/children/${children[0].id}`:"/guardian/children"}>Open learner profiles <ArrowRight size={13}/></Link><Link className="gd2-button" href="/guardian/messages">Family inbox <MessageSquareText size={13}/></Link></div></div><div className="gd2-hero-orbit"><div><strong>{children.length}</strong><span>linked learners</span></div></div></section>

      <section className="gd2-kpis">
        <article className="gd2-kpi"><header><span>Attendance today</span><CalendarCheck2 size={16}/></header><strong>{attendanceRecorded}/{children.length}</strong><p>Learners with at least one attendance event today.</p><div className="gd2-meter"><span style={{width:`${familyCoverage}%`}}/></div><Link href="/guardian/attendance">Open timeline →</Link></article>
        <article className="gd2-kpi"><header><span>Family balance</span><WalletCards size={16}/></header><strong>GH₵{familyBalance.toFixed(2)}</strong><p>Net outstanding value after posted payments and reversals.</p><Link href="/guardian/fees">See fee intelligence →</Link></article>
        <article className="gd2-kpi"><header><span>Released reports</span><GraduationCap size={16}/></header><strong>{publishedReports}</strong><p>Published report cards visible to this guardian account.</p><Link href="/guardian/academics">Review results →</Link></article>
        <article className="gd2-kpi"><header><span>Unread messages</span><MessageSquareText size={16}/></header><strong>{unreadMessages}</strong><p>School messages not yet marked as read in this inbox.</p><Link href="/guardian/messages">Open communication hub →</Link></article>
      </section>

      <div className="gd2-grid"><section className="gd2-section"><div className="gd2-section-head"><div><span>NEEDS ATTENTION</span><h2>Your next best actions</h2><p>Priority items are derived from current family records, not generic reminders.</p></div></div><div className="gd2-priority-list">{priorities.slice(0,5).map((item,index)=><article className={`gd2-priority ${item.tone}`} key={`${item.title}-${index}`}><i>{item.icon}</i><div><strong>{item.title}</strong><p>{item.detail}</p></div><Link href={item.href}>{item.label}<ArrowRight size={12}/></Link></article>)}</div></section>
      <section className="gd2-section"><div className="gd2-section-head"><div><span>QUICK ACCESS</span><h2>Family tools</h2><p>Go directly to the job you came to do.</p></div></div><nav className="gd2-quick"><Link href="/guardian/academic"><i><GraduationCap size={16}/></i><div><strong>Learning studio</strong><span>Homework, notes, attempts and feedback</span></div><ArrowRight size={13}/></Link><Link href="/guardian/arcade"><i><Gamepad2 size={16}/></i><div><strong>Learning Arcade</strong><span>Practice games, XP and progress</span></div><ArrowRight size={13}/></Link><Link href="/guardian/transport"><i><BusFront size={16}/></i><div><strong>Transport</strong><span>School transport and learner movement</span></div><ArrowRight size={13}/></Link><Link href="/guardian/library"><i><BookOpen size={16}/></i><div><strong>Library & resources</strong><span>Reading resources and learning material</span></div><ArrowRight size={13}/></Link></nav></section></div>

      <section className="gd2-section"><div className="gd2-section-head"><div><span>CHILD-BY-CHILD PULSE</span><h2>Every learner, clearly separated</h2><p>No more names running into counts. Each learner gets an independent school snapshot.</p></div><Link href="/guardian/children">All learner profiles →</Link></div>{children.length?<div className="gd2-child-grid">{children.map(student=>{const todayEvents=attendanceToday(student);const scoreAverage=averageFor(student);const balance=balanceFor(student);return <article className="gd2-child" key={student.id}><div className="gd2-child-top"><span className="gd2-avatar">{student.photoUrl?<Image src={student.photoUrl} alt="" width={52} height={52} unoptimized/>:student.name.slice(0,2).toUpperCase()}</span><div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.level?`${student.class.level} · `:""}{student.class?.name??"Class not set"}</p></div></div><div className="gd2-child-facts"><div><span>Today</span><strong>{todayEvents.length?"Attendance recorded":"Not recorded"}</strong></div><div><span>Released average</span><strong>{scoreAverage===null?"—":`${scoreAverage.toFixed(1)}%`}</strong></div><div><span>Balance</span><strong>GH₵{balance.toFixed(2)}</strong></div></div><div className="gd2-child-actions"><Link href={`/guardian/children/${student.id}`}>Open profile <ArrowRight size={11}/></Link><Link href={`/guardian/academic?studentId=${encodeURIComponent(student.id)}`}>Learning</Link><Link href={`/guardian/attendance?studentId=${encodeURIComponent(student.id)}`}>Attendance</Link><Link href={`/guardian/fees?studentId=${encodeURIComponent(student.id)}`}>Fees</Link></div></article>})}</div>:<div className="gd2-empty"><UsersRound size={22}/><strong>No linked learner yet</strong><p>Ask the school to connect this guardian account to a learner.</p></div>}</section>
    </div>
  </AppShell>;
}
