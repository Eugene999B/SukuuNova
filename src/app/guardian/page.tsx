import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, CircleCheckBig, GraduationCap, Mail, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/app/globals.css";

const PUBLISHED_REPORT_STATES = ["approved", "sent"] as const;

function localDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

export default async function GuardianPortalPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const data = await withTenant(session.schoolId, async (tx) => {
    const [settings, guardian] = await Promise.all([
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.guardian.findFirst({
        where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
        select: {
          name: true,
          students: { include: { student: {
            include: {
              class: true,
              attendanceEvents: true,
              scores: { include: { assessment: true, subject: true }, orderBy: { enteredAt: "desc" } },
              reportCards: { where: { status: { in: [...PUBLISHED_REPORT_STATES] } }, select: { termId: true } },
              invoices: { include: { payments: true } },
            },
          } } },
        },
      }),
    ]);
    return { timezone: settings?.timezone || "Africa/Accra", guardian };
  });
  if (!data.guardian) redirect("/login/guardian");

  const children = data.guardian.students.map((x) => x.student);
  const today = localDate(new Date(), data.timezone);
  const visibleScores = (student: typeof children[number]) => {
    const visibleTerms = new Set(student.reportCards.map((r) => r.termId));
    return student.scores.filter((score) => visibleTerms.has(score.assessment.termId));
  };
  const familyBalance = children.reduce((total, student) => total + student.invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount) - invoice.payments.reduce((paid, payment) => paid + Number(payment.amount), 0), 0), 0);

  return <AppShell universe="guardian" title="Family dashboard" subtitle="Attendance, school updates, results and fees for the children connected to you." active="Overview" schoolName={session.schoolName} schoolCode="" userName={data.guardian.name} role="Guardian">
    <div className="guardian-command-center">
      <section className="guardian-hero app-card"><div><span className="guardian-eyebrow">Family workspace</span><h2>Good morning, {data.guardian.name.split(/\s+/)[0] || data.guardian.name}.</h2><p>Everything here is limited to your linked children. Start with the child or task you need today.</p></div><div className="guardian-balance"><span>Family balance</span><strong>GH₵{familyBalance.toFixed(2)}</strong><Link href="/guardian/fees">View fees <ArrowRight size={13} aria-hidden="true" /></Link></div></section>
      <section className="guardian-task-grid">
        <Link href="/guardian/attendance" className="guardian-task-card"><span className="guardian-task-icon"><CircleCheckBig size={18} aria-hidden="true" /></span><div><strong>Today’s attendance</strong><span>{children.length ? `${children.filter((s) => s.attendanceEvents.some((e) => localDate(e.attendanceDate, data.timezone) === today)).length} of ${children.length} children have attendance recorded today.` : "No linked children yet."}</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/academics" className="guardian-task-card"><span className="guardian-task-icon"><GraduationCap size={18} aria-hidden="true" /></span><div><strong>Recent results</strong><span>Open published academic records.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/messages" className="guardian-task-card"><span className="guardian-task-icon"><Mail size={18} aria-hidden="true" /></span><div><strong>Messages</strong><span>Read school conversations and updates.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/fees" className="guardian-task-card"><span className="guardian-task-icon"><WalletCards size={18} aria-hidden="true" /></span><div><strong>Fees & receipts</strong><span>Review balances and receipts.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
      <section className="guardian-panel app-card"><div className="guardian-panel-head"><div><span className="guardian-eyebrow">Your children</span><h2>Open a child</h2><p>Attendance, results and fees are available from each child’s page.</p></div></div><div className="guardian-child-grid">
        {children.length ? children.map((student) => { const scores = visibleScores(student); const latest = scores[0]; const todayAttendance = student.attendanceEvents.filter((e) => localDate(e.attendanceDate, data.timezone) === today); const balance = student.invoices.reduce((n, inv) => n + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0); return <article className="guardian-child" key={student.id}><div className="guardian-child-head"><div className="guardian-child-avatar">{student.photoUrl ? <Image src={student.photoUrl} alt="" width={54} height={54} unoptimized /> : student.name.slice(0, 2).toUpperCase()}</div><div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.level ? `${student.class.level} · ` : ""}{student.class?.name ?? "Unassigned"}</p></div></div><div className="guardian-child-facts"><div><span>Today</span><strong>{todayAttendance[0]?.type ?? "Not recorded"}</strong></div><div><span>Latest result</span><strong>{latest ? String(latest.value) : "—"}</strong></div><div><span>Fees</span><strong>GH₵{balance.toFixed(2)}</strong></div></div><Link href={`/guardian/children/${student.id}`} className="guardian-child-link">Open learner <ArrowRight size={14} aria-hidden="true" /></Link></article>; }) : <div className="guardian-empty"><strong>No children are linked yet.</strong><p>Ask your school to connect your guardian account to a learner.</p></div>}
      </div></section>
    </div>
    <style>{styles}</style>
  </AppShell>;
}

const styles = `
.guardian-command-center {
  display: grid;
  gap: 20px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 4px 0 48px;
}

.guardian-hero,
.guardian-panel,
.guardian-task-card {
  border: 1px solid var(--sn-line);
  background: var(--sn-surface);
  border-radius: var(--sn-radius-xl);
  box-shadow: var(--sn-shadow-sm);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.guardian-hero:hover,
.guardian-panel:hover,
.guardian-task-card:hover {
  box-shadow: var(--sn-shadow-md);
}

.guardian-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
  padding: 28px 32px;
  background: linear-gradient(135deg, var(--sn-surface) 0%, var(--sn-guardian-tint) 100%);
}

.guardian-eyebrow {
  display: block;
  color: var(--sn-guardian-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.guardian-hero h2,
.guardian-panel h2 {
  margin: 6px 0 2px;
  color: var(--sn-ink);
  letter-spacing: -0.035em;
  font-weight: 850;
}

.guardian-hero h2 {
  font-size: clamp(24px, 2.5vw, 32px);
}

.guardian-hero p,
.guardian-panel-head p {
  margin: 0;
  color: var(--sn-muted);
  font-size: 13.5px;
  line-height: 1.55;
}

.guardian-balance {
  text-align: right;
  flex-shrink: 0;
}

.guardian-balance span {
  display: block;
  color: var(--sn-muted);
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.guardian-balance strong {
  display: block;
  margin: 4px 0;
  color: var(--sn-ink);
  font-size: 26px;
  font-weight: 850;
  letter-spacing: -0.02em;
}

.guardian-balance a,
.guardian-child-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sn-guardian-accent);
  font-size: 12.5px;
  font-weight: 750;
  text-decoration: none;
}

.guardian-balance a:hover,
.guardian-child-link:hover {
  text-decoration: underline;
}

.guardian-task-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.guardian-task-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  color: var(--sn-ink);
  text-decoration: none;
  background: var(--sn-surface-2);
}

.guardian-task-card:hover {
  border-color: var(--sn-guardian-accent);
  background: var(--sn-surface);
  transform: translateY(-2px);
}

.guardian-task-card > div {
  min-width: 0;
  flex: 1;
}

.guardian-task-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--sn-radius-md);
  background: var(--sn-guardian-tint);
  color: var(--sn-guardian-accent);
  flex-shrink: 0;
}

.guardian-task-card strong {
  display: block;
  font-size: 13.5px;
  font-weight: 750;
}

.guardian-task-card span:not(.guardian-task-icon) {
  display: block;
  margin-top: 2px;
  color: var(--sn-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

.guardian-task-card > svg {
  color: var(--sn-guardian-accent);
  flex-shrink: 0;
}

.guardian-panel {
  padding: 24px;
}

.guardian-panel-head {
  display: flex;
  margin-bottom: 16px;
}

.guardian-child-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.guardian-child {
  border: 1px solid var(--sn-line);
  border-radius: var(--sn-radius-lg);
  padding: 18px;
  background: var(--sn-surface-2);
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease;
}

.guardian-child:hover {
  background: var(--sn-surface);
  border-color: var(--sn-line-strong);
  box-shadow: var(--sn-shadow-sm);
}

.guardian-child-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.guardian-child-avatar {
  width: 52px;
  height: 52px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--sn-radius-md);
  background: var(--sn-guardian-tint);
  color: var(--sn-guardian-accent);
  font-weight: 850;
  font-size: 16px;
  border: 1px solid var(--sn-line);
}

.guardian-child-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.guardian-child h3 {
  margin: 0;
  color: var(--sn-ink);
  font-size: 15px;
  font-weight: 750;
}

.guardian-child p {
  margin: 3px 0 0;
  color: var(--sn-muted);
  font-size: 12px;
}

.guardian-child-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin-top: 14px;
  border: 1px solid var(--sn-line);
  overflow: hidden;
  border-radius: var(--sn-radius-md);
  background: var(--sn-line);
}

.guardian-child-facts div {
  padding: 10px 12px;
  background: var(--sn-surface);
}

.guardian-child-facts span {
  display: block;
  color: var(--sn-muted);
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.guardian-child-facts strong {
  display: block;
  margin-top: 3px;
  color: var(--sn-ink);
  font-size: 13.5px;
  font-weight: 800;
}

.guardian-child-link {
  margin-top: 16px;
  align-self: flex-start;
}

.guardian-empty {
  padding: 36px 20px;
  text-align: center;
  background: var(--sn-surface-2);
  border: 1px dashed var(--sn-line);
  border-radius: var(--sn-radius-lg);
}

.guardian-empty strong {
  color: var(--sn-ink);
  font-size: 14px;
}

.guardian-empty p {
  margin: 4px 0 0;
  color: var(--sn-muted);
  font-size: 12.5px;
}

@media (max-width: 900px) {
  .guardian-task-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .guardian-hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .guardian-balance {
    text-align: left;
    margin-top: 12px;
  }
}

@media (max-width: 520px) {
  .guardian-task-grid {
    grid-template-columns: 1fr;
  }
  .guardian-hero,
  .guardian-panel {
    padding: 20px 16px;
  }
  .guardian-hero h2 {
    font-size: 24px;
  }
  .guardian-child-grid {
    grid-template-columns: 1fr;
  }
}
`;
