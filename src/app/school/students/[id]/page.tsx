import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../students-workspace.css";

type ProgressStyle = React.CSSProperties & { "--progress"?: string };

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const student = await tx.student.findUnique({
      where: { id },
      select: {
        id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true,
        class: { select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } } },
        guardians: { select: { relationship: true, isPrimary: true, guardian: { select: { name: true, phone: true } } } },
        _count: { select: { reportCards: true, invoices: true, attendanceEvents: true } }
      }
    });
    if (!student) return null;
    const [scoreStats, attendanceStats, invoiceStats] = await Promise.all([
      tx.score.aggregate({ where: { studentId: id }, _avg: { value: true }, _count: { _all: true } }),
      tx.attendanceEvent.groupBy({ by: ["type"], where: { studentId: id }, _count: { _all: true } }),
      tx.invoice.aggregate({ where: { studentId: id }, _sum: { totalAmount: true, amountPaid: true } })
    ]);
    return { student, scoreStats, attendanceStats, invoiceStats };
  });
  if (!data) notFound();

  const attendance = Object.fromEntries(data.attendanceStats.map((row) => [row.type, row._count._all]));
  const average = data.scoreStats._avg.value == null ? null : Number(data.scoreStats._avg.value).toFixed(1);
  const billed = Number(data.invoiceStats._sum.totalAmount ?? 0);
  const paid = Number(data.invoiceStats._sum.amountPaid ?? 0);
  const balance = Math.max(0, billed - paid);
  const progressStyle: ProgressStyle = { "--progress": average ? `${Math.max(0, Math.min(100, Number(average)))}%` : "0%" };

  return (
    <AppShell universe="school" title={data.student.name} subtitle="One connected learner record across identity, class, family, attendance, academics and finance." active="Students" schoolName="School Workspace" schoolCode="" userName={session.name}>
      <div className="student-profile">
        <section className="student-profile-hero">
          <Link href="/school/students" className="back-link">← Students</Link>
          <div className="profile-identity">
            <div className="profile-photo-wrap">{data.student.photoUrl ? <img src={data.student.photoUrl} alt={`${data.student.name} portrait`} className="profile-photo" /> : <div className="profile-photo-empty">{data.student.name.slice(0, 2).toUpperCase()}</div>}</div>
            <div><div className="eyebrow">Learner profile</div><h2>{data.student.name}</h2><p>{data.student.class?.level ?? "No grade"} · {data.student.class?.name ?? "Awaiting class placement"} · <b>Index {data.student.admissionNo}</b></p></div>
            <span className={`profile-status ${data.student.status === "active" ? "active" : "muted"}`}>{data.student.status}</span>
          </div>
          <div className="profile-actions"><Link className="button secondary" href={`/school/students?action=edit&id=${data.student.id}`}>Edit profile</Link><button className="button secondary" type="button">Print ID card</button><button className="button primary" type="button">More actions</button></div>
        </section>

        <section className="profile-kpis">
          <article><span>Academic average</span><strong>{average ?? "—"}{average ? "%" : ""}</strong><small>{data.scoreStats._count._all ? `${data.scoreStats._count._all} scores recorded` : "No results yet"}</small></article>
          <article><span>Attendance events</span><strong>{data.student._count.attendanceEvents}</strong><small>{attendance.present ?? 0} present · {attendance.late ?? 0} late · {attendance.absent ?? 0} absent</small></article>
          <article><span>Report cards</span><strong>{data.student._count.reportCards}</strong><small>Generated academic reports</small></article>
          <article><span>Fee balance</span><strong>GH₵{balance.toFixed(2)}</strong><small>From linked invoices</small></article>
        </section>

        <div className="profile-grid">
          <section className="profile-card"><div className="profile-card-head"><div><div className="eyebrow">Identity</div><h3>Student information</h3></div><span>Index number is system-generated</span></div><div className="detail-grid"><div><small>Index number</small><b>{data.student.admissionNo}</b></div><div><small>Date of birth</small><b>{data.student.dob ? new Date(data.student.dob).toLocaleDateString("en-GB") : "Not recorded"}</b></div><div><small>Status</small><b>{data.student.status}</b></div><div><small>Class teacher</small><b>{data.student.class?.classTeacher?.name ?? "Not assigned"}</b></div></div></section>

          <section className="profile-card"><div className="profile-card-head"><div><div className="eyebrow">Family</div><h3>Parents & guardians</h3></div><Link href="/school/guardians">Manage family →</Link></div>{data.student.guardians.length ? <div className="family-list">{data.student.guardians.map((link) => <div className="family-row" key={`${link.guardian.name}-${link.guardian.phone}`}><span className="family-avatar">{link.guardian.name.slice(0,2).toUpperCase()}</span><div><b>{link.guardian.name}</b><small>{link.relationship}{link.isPrimary ? " · Primary" : ""} · {link.guardian.phone}</small></div></div>)}</div> : <div className="mini-empty"><strong>No guardian linked</strong><p>Add the primary family contact so attendance alerts, receipts and school messages reach the right person.</p><Link href="/school/guardians">Add guardian →</Link></div>}</section>

          <section className="profile-card profile-wide"><div className="profile-card-head"><div><div className="eyebrow">Academic snapshot</div><h3>Performance at a glance</h3><p>As scores are entered, this panel becomes the learner's longitudinal academic view.</p></div><Link href="/school/gradebook">Open gradebook →</Link></div><div className="progress-visual"><div className="progress-ring" style={progressStyle}><span>{average ?? "—"}</span></div><div><strong>{average ? "Current average" : "Waiting for first score"}</strong><p>Subject-level marks, assessment history, class position where configured, teacher comments and report-card outcomes will connect here.</p><div className="profile-link-row"><Link href="/school/exams">Assessments</Link><Link href="/school/report-cards">Report cards</Link><Link href="/school/homework">Homework</Link></div></div></div></section>

          <section className="profile-card"><div className="profile-card-head"><div><div className="eyebrow">Attendance</div><h3>Attendance summary</h3></div><Link href="/school/attendance">Open attendance →</Link></div><div className="attendance-bars"><div><span>Present</span><b>{attendance.present ?? 0}</b></div><div><span>Late</span><b>{attendance.late ?? 0}</b></div><div><span>Absent</span><b>{attendance.absent ?? 0}</b></div></div></section>

          <section className="profile-card"><div className="profile-card-head"><div><div className="eyebrow">Finance</div><h3>Fees & balances</h3></div><Link href="/school/fees">Open finance →</Link></div><div className="finance-summary"><div><small>Total billed</small><b>GH₵{billed.toFixed(2)}</b></div><div><small>Paid</small><b>GH₵{paid.toFixed(2)}</b></div><div><small>Outstanding</small><b>GH₵{balance.toFixed(2)}</b></div></div></section>
        </div>

        <section className="profile-connected"><div><div className="eyebrow">Connected workflows</div><h3>This learner should flow through the whole school.</h3><p>Class placement becomes the common context for daily attendance, subject teaching, assessments, homework, report cards and fees. The profile is designed to grow with the learner instead of fragmenting information across separate pages.</p></div><div className="connected-links"><Link href="/school/classes">Class placement <span>→</span></Link><Link href="/school/attendance">Attendance <span>→</span></Link><Link href="/school/timetable">Timetable <span>→</span></Link><Link href="/school/gradebook">Academic results <span>→</span></Link><Link href="/school/fees">Fees & payments <span>→</span></Link><Link href="/school/report-cards">Report cards <span>→</span></Link></div></section>
      </div>
    </AppShell>
  );
}
