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

type Severity = "critical" | "high" | "watch";
type LeadershipAction = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  value: string;
  href: string;
  impact: number;
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, watch: 1 };

function prioritized(actions: LeadershipAction[]) {
  return actions.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.impact - a.impact || a.title.localeCompare(b.title));
}

export default async function AnalyticsPage() {
  const session = await requireSchoolSession();
  const today = new Date(`${ghToday()}T00:00:00.000Z`);

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "analytics:view");
    const term = await tx.term.findFirst({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
    const [
      school,
      settings,
      activeStudents,
      classes,
      attendanceToday,
      invoiceTotals,
      messageFailures,
      missingGuardians,
      lessonQueue,
      overdueLoans,
      smsWallet,
      teacherConflicts,
      venueConflicts,
      staffPopulation,
      staffAttendance,
    ] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.student.count({ where: { status: "active" } }),
      tx.class.count(),
      tx.attendanceEvent.findMany({ where: { attendanceDate: today, studentId: { not: null } }, select: { studentId: true, type: true }, orderBy: { timestamp: "desc" } }),
      tx.invoice.findMany({ select: { totalAmount: true, payments: { select: { amount: true } } } }),
      tx.message.count({ where: { status: "failed" } }),
      tx.student.count({ where: { status: "active", guardians: { none: {} } } }),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS "count" FROM "LessonPlan" WHERE "schoolId"=$1 AND "status"='submitted'`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS "count" FROM "P3LibraryLoan" WHERE "schoolId"=$1 AND "status"='borrowed' AND "dueAt"<CURRENT_TIMESTAMP`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ smsBalance: number; status: string }>>(`SELECT "smsBalance","status" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1 LIMIT 1`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COALESCE(SUM(x.c),0)::int AS "count" FROM (SELECT COUNT(*)::int AS c FROM "TimetableSlot" WHERE "schoolId"=$1 GROUP BY "teacherId","dayOfWeek","period" HAVING COUNT(*)>1) x`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COALESCE(SUM(x.c),0)::int AS "count" FROM (SELECT COUNT(*)::int AS c FROM "TimetableSlot" WHERE "schoolId"=$1 AND "venue" IS NOT NULL AND BTRIM("venue")<>'' GROUP BY LOWER(BTRIM("venue")),"dayOfWeek","period" HAVING COUNT(*)>1) x`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(DISTINCT u."id")::int AS "count" FROM "User" u JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId" JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId" WHERE u."schoolId"=$1 AND u."status"='active' AND LOWER(COALESCE(NULLIF(BTRIM(r."key"),''),BTRIM(r."name"))) NOT IN ('parent','student')`, session.schoolId),
      tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(DISTINCT "staffId")::int AS "count" FROM "AttendanceEvent" WHERE "schoolId"=$1 AND "attendanceDate"=$2 AND "staffId" IS NOT NULL`, session.schoolId, today),
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
      missingGuardians,
      lessonQueue: Number(lessonQueue[0]?.count ?? 0),
      overdueLoans: Number(overdueLoans[0]?.count ?? 0),
      smsBalance: smsWallet[0] ? Number(smsWallet[0].smsBalance) : null,
      smsWalletStatus: smsWallet[0]?.status ?? null,
      teacherConflictSlots: Number(teacherConflicts[0]?.count ?? 0),
      venueConflictSlots: Number(venueConflicts[0]?.count ?? 0),
      staffPopulation: Number(staffPopulation[0]?.count ?? 0),
      staffAttendanceRecorded: Number(staffAttendance[0]?.count ?? 0),
    };
  });

  if (!data.school) return null;
  const recordedPct = data.activeStudents ? Math.round((data.attendanceRecorded / data.activeStudents) * 100) : 0;
  const presentPct = data.attendanceRecorded ? Math.round(((data.attendance.present + data.attendance.late + data.attendance.excused) / data.attendanceRecorded) * 100) : 0;
  const staffMissing = Math.max(0, data.staffPopulation - data.staffAttendanceRecorded);
  const timetableConflicts = data.teacherConflictSlots + data.venueConflictSlots;
  const actions: LeadershipAction[] = [];

  if (timetableConflicts > 0) actions.push({ key: "timetable", severity: "critical", title: "Timetable collisions need resolution", detail: `${data.teacherConflictSlots} teacher-conflict slots and ${data.venueConflictSlots} venue-conflict slots are scheduled at the same day and period.`, value: String(timetableConflicts), href: "/school/timetable", impact: timetableConflicts });
  if (data.attendanceMissing > 0) actions.push({ key: "attendance-missing", severity: "high", title: "Learner attendance is incomplete today", detail: `${data.attendanceMissing} active learners have no attendance event for ${ghToday()}.`, value: String(data.attendanceMissing), href: "/school/attendance", impact: data.attendanceMissing });
  if (data.attendance.absent > 0) actions.push({ key: "attendance-absent", severity: "high", title: "Learners are marked absent", detail: `${data.attendance.absent} learners are currently recorded absent. Review genuine exceptions and follow-up rules.`, value: String(data.attendance.absent), href: "/school/attendance/exceptions", impact: data.attendance.absent });
  if (data.reportMissing > 0 && data.term) actions.push({ key: "reports", severity: "high", title: "Current-term report cards are incomplete", detail: `${data.reportMissing} active learners do not yet have a report-card record for ${data.term.name}.`, value: String(data.reportMissing), href: "/school/report-cards", impact: data.reportMissing });
  if (data.lessonQueue > 0) actions.push({ key: "lessons", severity: data.lessonQueue >= 10 ? "high" : "watch", title: "Lesson plans are waiting for review", detail: `${data.lessonQueue} submitted lesson plan${data.lessonQueue === 1 ? " is" : "s are"} awaiting an approval decision.`, value: String(data.lessonQueue), href: "/school/lessons", impact: data.lessonQueue });
  if (data.missingGuardians > 0) actions.push({ key: "guardians", severity: data.activeStudents && data.missingGuardians / data.activeStudents >= 0.2 ? "high" : "watch", title: "Learners are missing guardian links", detail: `${data.missingGuardians} active learner${data.missingGuardians === 1 ? " has" : "s have"} no guardian link, limiting Family Portal access and reliable parent delivery.`, value: String(data.missingGuardians), href: "/school/guardians", impact: data.missingGuardians });
  if (staffMissing > 0 && data.staffPopulation > 0) actions.push({ key: "staff-attendance", severity: "watch", title: "Staff attendance has gaps today", detail: `${staffMissing} of ${data.staffPopulation} active staff identities have no staff-attendance event today.`, value: String(staffMissing), href: "/school/attendance/staff", impact: staffMissing });
  if (data.overdueLoans > 0) actions.push({ key: "library", severity: "watch", title: "Library loans are overdue", detail: `${data.overdueLoans} borrowed item${data.overdueLoans === 1 ? " is" : "s are"} past the recorded due date and still open.`, value: String(data.overdueLoans), href: "/school/library", impact: data.overdueLoans });
  if (data.messageFailures > 0) actions.push({ key: "messages", severity: "high", title: "Communication deliveries failed", detail: `${data.messageFailures} message${data.messageFailures === 1 ? " remains" : "s remain"} in failed state and may need retry or provider investigation.`, value: String(data.messageFailures), href: "/school/communications/messages", impact: data.messageFailures });
  if (data.smsBalance == null || data.smsWalletStatus !== "active") actions.push({ key: "sms", severity: "high", title: "SMS wallet is not ready", detail: "No active prepaid SMS wallet is available for this school. Parent alerts may fail when SMS is required.", value: "—", href: "/school/communications/settings", impact: 1000 });
  else if (data.smsBalance < 200) actions.push({ key: "sms", severity: data.smsBalance < 50 ? "high" : "watch", title: "SMS credit balance is low", detail: `${data.smsBalance} prepaid SMS segment${data.smsBalance === 1 ? " remains" : "s remain"}. Replenish before high-volume alerts or report delivery.`, value: String(data.smsBalance), href: "/school/communications/settings", impact: Math.max(1, 200 - data.smsBalance) });
  if (data.outstanding > 0) actions.push({ key: "fees", severity: "watch", title: "Fee balances need follow-up", detail: `${money(data.outstanding)} remains outstanding across current invoice balances.`, value: money(data.outstanding), href: "/school/fees/arrears", impact: Math.min(10000, Math.round(data.outstanding / 100)) });

  const queue = prioritized(actions);
  const urgentCount = queue.filter((action) => action.severity === "critical" || action.severity === "high").length;

  return <AppShell universe="school" title="Leadership Action Center" subtitle="What needs leadership attention now." active="School Analytics" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace analytics-simple">
      <section className="module-setup-card module-card"><div><span className="module-overline">Leadership action center</span><h3>{data.term?.name ?? "Current school data"}</h3><p>Exceptions are ranked by operational severity and impact. Every item states the evidence that triggered it and opens the workflow where it can be resolved.</p></div><span className="app-pill">{data.timezone}</span></section>

      <section className="module-metrics" aria-label="School health summary">
        <article><span>Open actions</span><strong>{queue.length}</strong><small>{urgentCount} high/critical</small></article>
        <article><span>Attendance today</span><strong>{recordedPct}%</strong><small>{data.attendanceMissing} still missing</small></article>
        <article><span>Reports released</span><strong>{data.released}/{data.activeStudents}</strong><small>{data.reportMissing} without report</small></article>
        <article><span>Outstanding fees</span><strong>{money(data.outstanding)}</strong><small>Current invoice balances</small></article>
      </section>

      <section className="module-card">
        <div className="module-section-title"><div><span>Prioritized queue</span><h3>Resolve these next</h3></div></div>
        <div className="module-list">
          {queue.map((action) => <Link href={action.href} className="module-list-row" key={action.key}><span className="module-list-no">{action.value}</span><div><b>{action.title}</b><span>{action.detail} · Priority: {action.severity}.</span></div></Link>)}
          {queue.length === 0 ? <div className="platform-empty"><strong>No current operational exception detected.</strong><span>Keep monitoring as attendance, finance, academic review and communication data changes.</span></div> : null}
        </div>
      </section>

      <details className="sn-progressive"><summary>Why these actions are ranked this way</summary><div className="sn-progressive-body"><p className="module-muted">SukuuNova uses an explainable deterministic rule: critical items first, then high-priority items, then watch items. Within the same severity, larger affected counts rank first. No opaque AI score changes school records or hides the triggering evidence.</p></div></details>

      <details className="sn-progressive"><summary>Attendance detail</summary><div className="sn-progressive-body"><div className="module-stats"><div className="module-stat"><small>Present</small><strong>{data.attendance.present}</strong></div><div className="module-stat"><small>Late</small><strong>{data.attendance.late}</strong></div><div className="module-stat"><small>Absent</small><strong>{data.attendance.absent}</strong></div><div className="module-stat"><small>Excused</small><strong>{data.attendance.excused}</strong></div></div><p className="module-muted">{presentPct}% of recorded learners are present, late or excused.</p><div className="module-actions"><Link className="module-button secondary" href="/school/attendance">Open attendance</Link><Link className="module-button secondary" href="/school/attendance/exceptions">Review exceptions</Link></div></div></details>

      <details className="sn-progressive"><summary>Report-card pipeline</summary><div className="sn-progressive-body"><div className="module-stats"><div className="module-stat"><small>Draft</small><strong>{data.drafts}</strong></div><div className="module-stat"><small>For review</small><strong>{data.submitted}</strong></div><div className="module-stat"><small>Approved</small><strong>{data.approved}</strong></div><div className="module-stat"><small>Released</small><strong>{data.released}</strong></div></div><div className="module-actions"><Link className="module-button secondary" href="/school/report-cards">Report Cards</Link><Link className="module-button secondary" href="/school/reports">Reports Centre</Link></div></div></details>
    </div>
  </AppShell>;
}
