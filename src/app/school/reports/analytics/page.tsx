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

    const [school, settings, term, activeStudents, classes, attendanceToday, termReports, invoiceTotals, messageFailures] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.term.findFirst({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
      tx.student.count({ where: { status: "active" } }),
      tx.class.count(),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today, studentId: { not: null } }, select: { studentId: true, type: true }, orderBy: { timestamp: "desc" } }),
      term ? tx.reportCard.findMany({ where: { termId: term.id }, select: { studentId: true, status: true } }) : Promise.resolve([]),
      tx.invoice.findMany({ select: { totalAmount: true, payments: { select: { amount: true } } } }),
      tx.message.count({ where: { status: "failed" } }),
    ]);

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
    const released = termReports.filter((report) => report.status === "sent").length;
    const approved = termReports.filter((report) => report.status === "approved").length;
    const submitted = termReports.filter((report) => report.status === "submitted").length;
    const drafts = termReports.filter((report) => report.status === "draft").length;

    return {
      school,
      timezone: settings?.timezone ?? "Africa/Accra",
      term,
      activeStudents,
      classes,
      attendance,
      attendanceRecorded: seenStudents.size,
      attendanceMissing: Math.max(0, activeStudents - seenStudents.size),
      reportsTotal: termReports.length,
      reportMissing: Math.max(0, activeStudents - reportStudents.size),
      released,
      approved,
      submitted,
      drafts,
      outstanding,
      messageFailures,
    };
  });

  if (!data.school) return null;
  const recordedPct = data.activeStudents ? Math.round((data.attendanceRecorded / data.activeStudents) * 100) : 0;
  const attendancePresentPct = data.attendanceRecorded ? Math.round(((data.attendance.present + data.attendance.late + data.attendance.excused) / data.attendanceRecorded) * 100) : 0;

  return <AppShell universe="school" title="School Analytics" subtitle="Real operational intelligence from students, attendance, report cards, finance and communications." active="School Analytics" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="reports-light space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
        <span className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Executive intelligence</span>
        <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="text-2xl font-black tracking-tight">{data.term?.name ?? "Current school data"}</h2><p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">These metrics are calculated from tenant-scoped records. Missing work is shown as missing rather than being presented as completed.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><span className="block text-[9px] font-black uppercase tracking-[.12em] text-slate-400">School timezone</span><strong className="mt-1 block text-xs text-white">{data.timezone}</strong></div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Active students</span><strong className="mt-2 block text-2xl font-black text-slate-950">{data.activeStudents}</strong><span className="mt-1 block text-[10px] text-slate-500">Across {data.classes} classes</span></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Attendance today</span><strong className="mt-2 block text-2xl font-black text-slate-950">{recordedPct}%</strong><span className="mt-1 block text-[10px] text-slate-500">{data.attendanceRecorded} recorded · {data.attendanceMissing} missing</span></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Report cards</span><strong className="mt-2 block text-2xl font-black text-slate-950">{data.released}/{data.activeStudents}</strong><span className="mt-1 block text-[10px] text-slate-500">Released for {data.term?.name ?? "current term"}</span></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Outstanding fees</span><strong className="mt-2 block text-2xl font-black text-slate-950">{money(data.outstanding)}</strong><span className="mt-1 block text-[10px] text-slate-500">Calculated from invoices less recorded payments</span></article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr,.75fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Attendance signal</span><h3 className="mt-1 text-base font-black text-slate-950">Today’s recorded register</h3><p className="mt-1 text-[10px] text-slate-500">Unique learners with a school attendance record for today.</p></div><strong className="text-sm font-black text-emerald-700">{attendancePresentPct}% present / late / excused</strong></div>
          <div className="mt-5 grid grid-cols-4 gap-2"><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] text-slate-500">Present</span><strong className="mt-1 block text-lg font-black">{data.attendance.present}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] text-slate-500">Late</span><strong className="mt-1 block text-lg font-black">{data.attendance.late}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] text-slate-500">Absent</span><strong className="mt-1 block text-lg font-black">{data.attendance.absent}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] text-slate-500">Excused</span><strong className="mt-1 block text-lg font-black">{data.attendance.excused}</strong></div></div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, recordedPct)}%` }} /></div>
          <div className="mt-4 flex gap-2"><Link className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white" href="/school/attendance">Open attendance</Link><Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700" href="/school/attendance/exceptions">Review exceptions</Link></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[9px] font-black uppercase tracking-[.12em] text-emerald-700">Decision queue</span><h3 className="mt-1 text-base font-black text-slate-950">Actual exceptions</h3><div className="mt-4 space-y-2">
          <Link href="/school/attendance" className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700"><span>{data.attendanceMissing} learners without today’s attendance</span><span>→</span></Link>
          <Link href="/school/report-cards" className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700"><span>{data.reportMissing} learners without a report card</span><span>→</span></Link>
          <Link href="/school/fees/arrears" className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700"><span>{money(data.outstanding)} outstanding across invoices</span><span>→</span></Link>
          <Link href="/school/communications/messages" className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-[10px] font-bold text-slate-700"><span>{data.messageFailures} failed messages</span><span>→</span></Link>
        </div></section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Report-card pipeline</span><h3 className="mt-1 text-base font-black text-slate-950">Current term status</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><span className="text-[9px] text-slate-500">Draft</span><strong className="mt-1 block text-xl font-black">{data.drafts}</strong></div><div className="rounded-xl bg-slate-50 p-4"><span className="text-[9px] text-slate-500">For review</span><strong className="mt-1 block text-xl font-black">{data.submitted}</strong></div><div className="rounded-xl bg-slate-50 p-4"><span className="text-[9px] text-slate-500">Approved</span><strong className="mt-1 block text-xl font-black">{data.approved}</strong></div><div className="rounded-xl bg-slate-50 p-4"><span className="text-[9px] text-slate-500">Released</span><strong className="mt-1 block text-xl font-black">{data.released}</strong></div></div><div className="mt-4 flex gap-2"><Link className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white" href="/school/report-cards">Open Report Card Studio</Link><Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700" href="/school/reports">Open Reports Centre</Link></div></section>
    </div>
  </AppShell>;
}