import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, CircleCheckBig, GraduationCap, Mail, WalletCards } from "lucide-react";
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
    select: { name: true, students: { include: { student: { include: { class: true, attendanceEvents: true, scores: { include: { assessment: true, subject: true } }, reportCards: { where: { status: { in: [...PUBLISHED_REPORT_STATES] } }, select: { termId: true, status: true } }, invoices: { include: { payments: true } } } } } }
  }));
  if (!data) redirect("/login/guardian");

  const children = data.students.map((x) => x.student);
  const visibleScores = (student: typeof children[number]) => { const visibleTerms = new Set(student.reportCards.map((report) => report.termId)); return student.scores.filter((score) => visibleTerms.has(score.assessment.termId)); };
  const balance = children.reduce((n, s) => n + s.invoices.reduce((sum, inv) => sum + Number(inv.totalAmount) - inv.payments.reduce((paid, p) => paid + Number(p.amount), 0), 0), 0);
  const firstName = data.name.split(/\s+/)[0] || data.name;

  return <AppShell universe="guardian" title="Family dashboard" subtitle="Attendance, school updates, results and fees for the children connected to you." active="Overview" schoolName={session.schoolName} schoolCode="" userName={data.name} role="Guardian">
    <div className="guardian-command-center">
      <section className="guardian-hero app-card"><div><span className="guardian-eyebrow">Family workspace</span><h2>Good morning, {firstName}.</h2><p>Everything here is limited to your linked children. Start with the child or task you need today.</p></div><div className="guardian-balance"><span>Family balance</span><strong>GH₵{balance.toFixed(2)}</strong><Link href="/guardian/fees">View fees <ArrowRight size={13} aria-hidden="true" /></Link></div></section>

      <section className="guardian-task-grid">
        <Link href="/guardian/attendance" className="guardian-task-card"><span className="guardian-task-icon"><CircleCheckBig size={18} aria-hidden="true" /></span><div><strong>Today’s attendance</strong><span>See attendance for each child.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/academics" className="guardian-task-card"><span className="guardian-task-icon"><GraduationCap size={18} aria-hidden="true" /></span><div><strong>Recent results</strong><span>Open published academic records.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/messages" className="guardian-task-card"><span className="guardian-task-icon"><Mail size={18} aria-hidden="true" /></span><div><strong>Messages</strong><span>Read school conversations and updates.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/guardian/fees" className="guardian-task-card"><span className="guardian-task-icon"><WalletCards size={18} aria-hidden="true" /></span><div><strong>Fees & receipts</strong><span>Review balances and receipts.</span></div><ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <section className="guardian-panel app-card"><div className="guardian-panel-head"><div><span className="guardian-eyebrow">Your children</span><h2>Open a child</h2><p>Attendance, results and fees are available from each child’s page.</p></div></div><div className="guardian-child-grid">
        {children.length ? children.map((student) => { const scores = visibleScores(student); const latest = scores[0]; const childBalance = student.invoices.reduce((n, inv) => n + Number(inv.totalAmount) - inv.payments.reduce((p, x) => p + Number(x.amount), 0), 0); return <article className="guardian-child" key={student.id}>
          <div className="guardian-child-head"><div className="guardian-child-avatar">{student.photoUrl ? <Image src={student.photoUrl} alt="" width={54} height={54} unoptimized /> : student.name.slice(0,2).toUpperCase()}</div><div><h3>{student.name}</h3><p>{student.admissionNo} · {student.class?.level ? `${student.class.level} · ` : ""}{student.class?.name ?? "Unassigned"}</p></div></div>
          <div className="guardian-child-facts"><div><span>Attendance</span><strong>{student.attendanceEvents.length}</strong></div><div><span>Latest result</span><strong>{latest ? latest.value : "—"}</strong></div><div><span>Fees</span><strong>GH₵{childBalance.toFixed(2)}</strong></div></div>
          <Link href={`/guardian/children/${student.id}`} className="guardian-child-link">Open learner <ArrowRight size={14} aria-hidden="true" /></Link>
        </article>; }) : <div className="guardian-empty"><strong>No children are linked yet.</strong><p>Ask your school to connect your guardian account to a learner.</p></div>}
      </div></section>
    </div>
    <style>{guardianStyles}</style>
  </AppShell>;
}

const guardianStyles = `.guardian-command-center{display:grid;gap:18px;max-width:1180px;margin:0 auto;padding:4px 0 36px}.guardian-hero,.guardian-panel{border:1px solid var(--color-border);background:var(--color-surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}.guardian-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:28px}.guardian-eyebrow{display:block;color:var(--color-brand);font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.guardian-hero h2,.guardian-panel h2{margin:6px 0;color:var(--color-text-primary);letter-spacing:-.03em}.guardian-hero h2{font-size:29px}.guardian-hero p,.guardian-panel-head p{margin:0;color:var(--color-text-secondary);font-size:11px}.guardian-balance{text-align:right}.guardian-balance span{display:block;color:var(--color-text-muted);font-size:9px}.guardian-balance strong{display:block;margin:4px 0;color:var(--color-text-primary);font-size:22px}.guardian-balance a,.guardian-child-link{display:inline-flex;align-items:center;gap:5px;color:var(--color-brand);font-size:9px;font-weight:850;text-decoration:none}.guardian-task-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.guardian-task-card{display:flex;align-items:center;gap:10px;padding:16px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text-primary);text-decoration:none;box-shadow:var(--shadow-sm)}.guardian-task-card:hover{border-color:var(--color-brand);background:var(--color-surface-soft);transform:translateY(-1px)}.guardian-task-card>div{min-width:0;flex:1}.guardian-task-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:var(--color-brand-soft);color:var(--color-brand)}.guardian-task-card strong{display:block;font-size:10px}.guardian-task-card span:not(.guardian-task-icon){display:block;margin-top:4px;color:var(--color-text-muted);font-size:8px;line-height:1.4}.guardian-task-card>svg{color:var(--color-brand)}.guardian-panel{padding:22px}.guardian-panel-head{display:flex;justify-content:space-between}.guardian-child-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:11px;margin-top:16px}.guardian-child{border:1px solid var(--color-border);border-radius:12px;padding:15px;background:var(--color-surface-soft)}.guardian-child-head{display:flex;align-items:center;gap:11px}.guardian-child-avatar{width:54px;height:54px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:var(--color-brand-soft);color:var(--color-brand);font-weight:900}.guardian-child-avatar img{width:100%;height:100%;object-fit:cover}.guardian-child h3{margin:0;color:var(--color-text-primary);font-size:14px}.guardian-child p{margin:4px 0 0;color:var(--color-text-muted);font-size:8px}.guardian-child-facts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;margin-top:13px;border:1px solid var(--color-border);overflow:hidden;border-radius:9px}.guardian-child-facts div{padding:10px;background:var(--color-surface)}.guardian-child-facts span{display:block;color:var(--color-text-muted);font-size:7px}.guardian-child-facts strong{display:block;margin-top:4px;color:var(--color-text-primary);font-size:12px}.guardian-child-link{margin-top:13px}.guardian-empty{padding:34px;text-align:center;background:var(--color-surface-soft);border:1px dashed var(--color-border);border-radius:12px}.guardian-empty strong{color:var(--color-text-primary);font-size:11px}.guardian-empty p{margin:5px 0 0;color:var(--color-text-muted);font-size:9px}@media(max-width:900px){.guardian-task-grid{grid-template-columns:repeat(2,1fr)}.guardian-hero{display:block}.guardian-balance{text-align:left;margin-top:16px}}@media(max-width:520px){.guardian-task-grid{grid-template-columns:1fr}.guardian-hero,.guardian-panel{padding:18px}.guardian-hero h2{font-size:24px}.guardian-child-grid{grid-template-columns:1fr}}`;
