import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../reports-light.css";

function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);
}

function ghToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" }).format(new Date());
}

export default async function AnalyticsPage() {
  const session = await requireSchoolSession();
  const today = new Date(`${ghToday()}T00:00:00.000Z`);

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "analytics:view");
    const term = await tx.term.findFirst({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
    const [school, settings, activeStudents, classes, attendanceToday, invoiceTotals, messageFailures] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.student.count({ where: { status: "active" } }),
      tx.class.count(),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today, studentId: { not: null } }, select: { studentId: true, type: true }, orderBy: { timestamp: "desc" } }),
      tx.invoice.findMany({ select: { totalAmount: true, payments: { select: { amount: true } } } }),
      tx.message.count({ where: { status: "failed" } }),
    ]);
    const termReports = term ? await tx.reportCard.findMany({ where: { termId: term.id }, select: { studentId: true, status: true } }) : [];

    const seenStudents = new Set<string>();
    const attendance = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const event of attendanceToday) {
      if (!event.studentId || seenStudents.has(event.studentId)) continue;
      seenStudents.add(event.studentId);
      if (event.type === "late") attendance.late += 1;
      else if (event.type === "absent") attendance.absent += 1;
      else if (event.type === "excused") attendance.excused += 1;
      else attendance.present += 1;
    }

    let outstanding = 0;
    for (const invoice of invoiceTotals) {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      outstanding += Math.max(0, Number(invoice.totalAmount) - paid);
    }

    const reportStudents = new Set(termReports.map((report) => report.studentId));
    return {
      school,
      timezone: settings?.timezone ?? "Africa/Accra",
      term,
      activeStudents,
      classes,
      attendance,
      attendanceRecorded: seenStudents.size,
      attendanceMissing: Math.max(0, activeStudents - seenStudents.size),
      reportMissing: Math.max(0, activeStudents - reportStudents.size),
      released: termReports.filter((report) => report.status === "sent").length,
      approved: termReports.filter((report) => report.status === "approved").length,
      submitted: termReports.filter((report) => report.status === "submitted").length,
      drafts: termReports.filter((report) => report.status === "draft").length,
      outstanding,
      messageFailures,
    };
  });

  if (!data.school) return null;
  const recordedPct = data.activeStudents ? Math.round((data.attendanceRecorded / data.activeStudents) * 100) : 0;
  const presentPct = data.attendanceRecorded ? Math.round(((data.attendance.present + data.attendance.late + data.attendance.excused) / data.attendanceRecorded) * 100) : 0;

  return <AppShell universe="school" title="School Analytics" subtitle="What needs leadership attention now." active="School Analytics" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace analytics-simple">
      <section className="module-setup-card module-card"><div><span className="module-overline">Leadership view</span><h3>{data.term?.name ?? "Current school data"}</h3><p>Start with exceptions. Open the supporting detail only when you need to investigate it.</p></div><span className="app-pill">{data.timezone}</span></section>

      <section className="module-metrics" aria-label="School health summary">
        <article><span>Active students</span><strong>{data.activeStudents}</strong><small>{data.classes} classes</small></article>
        <article><span>Attendance today</span><strong>{recordedPct}%</strong><small>{data.attendanceMissing} still missing</small></article>
        <article><span>Reports released</span><strong>{data.released}/{data.activeStudents}</strong><small>{data.reportMissing} without report</small></article>
        <article><span>Outstanding fees</span><strong>{money(data.outstanding)}</strong><small>Current invoice balances</small></article>
      </section>

      <section className="module-card">
        <div className="module-section-title"><div><span>Decision queue</span><h3>What needs attention</h3></div></div>
        <div className="module-list">
          <Link href="/school/attendance" className="module-list-row"><span className="module-list-no">{data.attendanceMissing}</span><div><b>Attendance records missing today</b><span>Open attendance and complete or verify the register.</span></div></Link>
          <Link href="/school/report-cards" className="module-list-row"><span className="module-list-no">{data.reportMissing}</span><div><b>Learners without a report card</b><span>Continue the current-term reporting workflow.</span></div></Link>
          <Link href="/school/fees/arrears" className="module-list-row"><span className="module-list-no">₵</span><div><b>{money(data.outstanding)} outstanding</b><span>Review balances and follow-up.</span></div></Link>
          <Link href="/school/communications/messages" className="module-list-row"><span className="module-list-no">{data.messageFailures}</span><div><b>Failed messages</b><span>Review delivery only where communication failed.</span></div></Link>
        </div>
      </section>

      <details className="sn-progressive"><summary>Attendance detail</summary><div className="sn-progressive-body"><div className="module-stats"><div className="module-stat"><small>Present</small><strong>{data.attendance.present}</strong></div><div className="module-stat"><small>Late</small><strong>{data.attendance.late}</strong></div><div className="module-stat"><small>Absent</small><strong>{data.attendance.absent}</strong></div><div className="module-stat"><small>Excused</small><strong>{data.attendance.excused}</strong></div></div><p className="module-muted">{presentPct}% of recorded learners are present, late or excused.</p><div className="module-actions"><Link className="module-button secondary" href="/school/attendance">Open attendance</Link><Link className="module-button secondary" href="/school/attendance/exceptions">Review exceptions</Link></div></div></details>

      <details className="sn-progressive"><summary>Report-card pipeline</summary><div className="sn-progressive-body"><div className="module-stats"><div className="module-stat"><small>Draft</small><strong>{data.drafts}</strong></div><div className="module-stat"><small>For review</small><strong>{data.submitted}</strong></div><div className="module-stat"><small>Approved</small><strong>{data.approved}</strong></div><div className="module-stat"><small>Released</small><strong>{data.released}</strong></div></div><div className="module-actions"><Link className="module-button secondary" href="/school/report-cards">Report Cards</Link><Link className="module-button secondary" href="/school/reports">Reports Centre</Link></div></div></details>
    </div>
  </AppShell>;
}