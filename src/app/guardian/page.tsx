import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/app/globals.css";

const PUBLISHED_REPORT_STATES = ["approved", "sent"] as const;

export default async function GuardianPortalPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");

  const data = await withTenant(session.schoolId, async (tx) => tx.guardian.findFirst({
    where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
    select: {
      name: true,
      students: { include: {
        student: { include: {
          class: true,
          attendanceEvents: true,
          scores: { include: { assessment: true, subject: true } },
          reportCards: { where: { status: { in: [...PUBLISHED_REPORT_STATES] } }, select: { termId: true, status: true } },
          invoices: { include: { payments: true } }
        } }
      } }
    }
  }));
  if (!data) redirect("/login/guardian");

  const children = data.students.map((x) => x.student);
  const attendance = children.reduce((n, s) => n + s.attendanceEvents.length, 0);
  const visibleScores = (student: typeof children[number]) => {
    const visibleTerms = new Set(student.reportCards.map((report) => report.termId));
    return student.scores.filter((score) => visibleTerms.has(score.assessment.termId));
  };
  const results = children.reduce((n, s) => n + visibleScores(s).length, 0);
  const balance = children.reduce((n, s) => n + s.invoices.reduce((sum, inv) => sum + Number(inv.totalAmount) - inv.payments.reduce((paid, p) => paid + Number(p.amount), 0), 0), 0);

  return (
    <AppShell
      universe="guardian"
      title="Family dashboard"
      subtitle="Your private window into only the learners linked to you."
      active="Overview"
      schoolName={session.schoolName}
      schoolCode=""
      userName={data.name}
      role="Guardian"
    >
      <section className="app-card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="app-card-head">
          <div>
            <span className="module-overline">Guardian workspace</span>
            <h2>Welcome back, {data.name.split(" ")[0]}.</h2>
            <p>Attendance, academics, homework, fees and messages are scoped to your linked children.</p>
          </div>
          <span className="app-pill">Private family view</span>
        </div>
      </section>

      <div className="app-grid kpis">
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Children</span><span className="app-kpi-icon"><UsersRoundIcon /></span></div><div className="app-kpi-value">{children.length}</div><div className="app-kpi-meta">School-linked only</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Attendance activity</span><span className="app-kpi-icon"><AttendanceIcon /></span></div><div className="app-kpi-value">{attendance}</div><div className="app-kpi-meta">Across your children</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Results published</span><span className="app-kpi-icon"><AcademicIcon /></span></div><div className="app-kpi-value">{results}</div><div className="app-kpi-meta">Approved school records</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Outstanding</span><span className="app-kpi-icon"><FeesIcon /></span></div><div className="app-kpi-value">GH₵{balance.toFixed(2)}</div><div className="app-kpi-meta">Live invoice balances</div></div>
      </div>

      <section className="app-card" style={{ padding: 18, marginTop: 16 }}>
        <div className="app-card-head"><div><h2>My children</h2><p>Open a child to see the full family-safe view.</p></div></div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
          {children.map((student) => {
            const scores = visibleScores(student);
            const latest = scores[0];
            const childBalance = student.invoices.reduce((n, inv) => n + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0);
            return (
              <article key={student.id} className="app-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 58, height: 58, borderRadius: 18, overflow: "hidden", background: "var(--sn-surface-2)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                    {student.photoUrl ? <Image src={student.photoUrl} alt="" width={58} height={58} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontWeight: 900 }}>{student.name.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div><h3 style={{ margin: 0 }}>{student.name}</h3><p style={{ margin: "4px 0 0", color: "var(--sn-muted)", fontSize: 10 }}>{student.admissionNo} · {student.class?.level ? `${student.class.level} · ` : ""}{student.class?.name ?? "Unassigned"}</p></div>
                </div>
                <div className="app-list" style={{ marginTop: 12 }}>
                  <div className="app-list-row"><span className="app-list-icon"><AcademicIcon /></span><div><b>Latest result</b><span>{latest ? `${latest.subject.name} · ${latest.value}` : "No published result"}</span></div></div>
                  <div className="app-list-row"><span className="app-list-icon"><AttendanceIcon /></span><div><b>Attendance</b><span>{student.attendanceEvents.length} recorded event{student.attendanceEvents.length === 1 ? "" : "s"}</span></div></div>
                  <div className="app-list-row"><span className="app-list-icon"><FeesIcon /></span><div><b>Fees</b><span>GH₵{childBalance.toFixed(2)} outstanding</span></div></div>
                </div>
                <Link href={`/guardian/children/${student.id}`} className="module-hero-button" style={{ display: "inline-flex", marginTop: 14 }}>Open learner →</Link>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function UsersRoundIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M16.5 14.5a5.1 5.1 0 0 1 4 5.5"/></svg>; }
function AttendanceIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.3 2.3 4.7-5"/></svg>; }
function AcademicIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3.5 9.5 12 5l8.5 4.5L12 14 3.5 9.5Z"/><path d="M6.5 11.2V16c2.7 2 10.3 2 13 0v-4.8"/></svg>; }
function FeesIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M8 14h3"/></svg>; }
