import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, Clock3, Download, FileCheck2, GraduationCap, Send, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { generateReportCard, submitReportCard } from "@/lib/report-card-service";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";

function origin() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/g, "");
}

async function runReportCardAction(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const action = String(formData.get("action") ?? "");
  const termId = String(formData.get("termId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const reportCardId = String(formData.get("reportCardId") ?? "");
  const headRemark = String(formData.get("headRemark") ?? "").trim().slice(0, 2000) || undefined;
  if (!termId) throw new Error("Select a reporting term first.");
  if (!classId) throw new Error("Select a class first.");

  if (action === "generate") {
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:generate");
      const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId, status: "active" }, select: { id: true }, orderBy: { name: "asc" } });
      const existing = await tx.reportCard.findMany({ where: { termId, student: { classId } }, select: { studentId: true } });
      const existingIds = new Set(existing.map((item) => item.studentId));
      let created = 0;
      for (const student of students) {
        if (existingIds.has(student.id)) continue;
        try {
          await generateReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, studentId: student.id, termId });
          created += 1;
        } catch {
          // Keep the rest of the class moving if a learner is not ready.
        }
      }
      const message = created ? `Generated ${created} report${created === 1 ? "" : "s"}.` : "No new reports were generated. Existing reports were left unchanged.";
      revalidatePath("/school/report-cards");
      redirect(`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}&notice=${encodeURIComponent(message)}`);
    });
  }

  if (!reportCardId) throw new Error("A report card is required.");
  await withTenant(session.schoolId, async (tx) => {
    if (action === "submit") await submitReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId });
    else if (action === "approve") await approveAndQueuePublicReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, headRemark, origin: origin() });
    else if (action === "release") await sendApprovedReportCardPublic(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: origin() });
    else throw new Error("Unsupported report-card action.");
  });
  revalidatePath("/school/report-cards");
  revalidatePath("/school/reports");
  redirect(`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`);
}

const statusLabel: Record<string, string> = { draft: "Draft", submitted: "For approval", approved: "Approved", sent: "Released" };
const statusHint: Record<string, string> = { draft: "Needs submission", submitted: "Waiting for approval", approved: "Ready to release", sent: "Published to families" };

function percent(n: number, d: number) {
  return d ? Math.max(0, Math.min(100, Math.round((n / d) * 100))) : 0;
}

function statusIcon(status: string) {
  if (status === "submitted") return <Clock3 aria-hidden="true" />;
  if (status === "approved") return <ShieldCheck aria-hidden="true" />;
  if (status === "sent") return <CheckCircle2 aria-hidden="true" />;
  return <ClipboardList aria-hidden="true" />;
}

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; notice?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 12, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
    ]);
    const term = terms.find((item) => item.id === params.term) ?? terms[0];
    const selectedClass = params.classId ? classes.find((item) => item.id === params.classId) ?? null : null;
    if (!term) return { school, terms, classes, term: null, selectedClass, students: [], reports: [], permissions: { generate: false, submit: false, approve: false } };
    const [students, reports, canGenerate, canSubmit, canApprove] = await Promise.all([
      selectedClass ? tx.student.findMany({ where: { schoolId: session.schoolId, classId: selectedClass.id, status: "active" }, select: { id: true, name: true, admissionNo: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      selectedClass ? tx.reportCard.findMany({ where: { termId: term.id, student: { classId: selectedClass.id } }, select: { id: true, studentId: true, status: true, createdAt: true, student: { select: { name: true, admissionNo: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }) : Promise.resolve([]),
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
    ]);
    return { school, terms, classes, term, selectedClass, students, reports, permissions: { generate: canGenerate, submit: canSubmit, approve: canApprove } };
  });

  if (!data.school) return null;

  if (!data.term) {
    return (
      <AppShell universe="school" title="Report Cards" subtitle="Prepare, review, approve and release official student reports in one calm workspace." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
        <main className="report-cards-page">
          <style>{REPORT_CARDS_STYLES}</style>
          <section className="report-empty-state">
            <div className="report-empty-icon"><BookOpen aria-hidden="true" /></div>
            <span className="report-eyebrow">ACADEMIC REPORTING</span>
            <h1>No reporting term is ready yet</h1>
            <p>Create an academic term before using the report-card workflow. Your existing school data remains unchanged.</p>
            <Link className="report-primary-link" href="/school/terms">Open Terms & Calendar <ArrowRight aria-hidden="true" /></Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const term = data.term;
  const learnerCount = data.students.length;
  const reportCount = data.reports.length;
  const submitted = data.reports.filter((item) => item.status === "submitted").length;
  const approved = data.reports.filter((item) => item.status === "approved").length;
  const released = data.reports.filter((item) => item.status === "sent").length;
  const drafts = data.reports.filter((item) => item.status === "draft").length;
  const missing = Math.max(0, learnerCount - reportCount);
  const coverage = percent(reportCount, learnerCount);
  const ready = percent(released, learnerCount);

  return (
    <AppShell universe="school" title="Report Cards" subtitle="Prepare, review, approve and release official student reports in one calm workspace." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main className="report-cards-page">
        <style>{REPORT_CARDS_STYLES}</style>

        {params.notice ? <div className="report-notice" role="status"><CheckCircle2 aria-hidden="true" /><span>{params.notice}</span></div> : null}

        <section className="report-hero">
          <div className="report-hero-copy">
            <div className="report-eyebrow"><span>OFFICIAL ACADEMIC REPORTING</span><i>•</i><span>{term.name}</span></div>
            <h1>Report cards, without the clutter.</h1>
            <p>Keep one class in focus, see exactly what is ready, and move each learner report through a clear four-step publishing flow.</p>
            <div className="report-hero-actions">
              <Link href="/school/gradebook/studio" className="report-primary-link"><BookOpen aria-hidden="true" /> Open Gradebook</Link>
              <Link href="/school/reports" className="report-secondary-link">View archive <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="report-hero-visual">
            <div className="report-ring" style={{ "--progress": `${ready}%` } as React.CSSProperties}>
              <div><strong>{ready}%</strong><span>released</span></div>
            </div>
            <div className="report-hero-visual-copy"><span>CLASS READINESS</span><strong>{coverage}% generated</strong><small>{missing ? `${missing} report${missing === 1 ? "" : "s"} still missing` : "Every active learner has a report"}</small></div>
          </div>
        </section>

        <section className="report-context-card">
          <div className="report-context-label"><span className="report-eyebrow">WORKING CONTEXT</span><strong>{data.selectedClass ? `${data.selectedClass.level ? `${data.selectedClass.level} · ` : ""}${data.selectedClass.name}` : "Choose a class"}</strong><small>{term.name} · {learnerCount} active learner{learnerCount === 1 ? "" : "s"}</small></div>
          <form method="get" className="report-selects">
            <label><span>Term</span><select name="term" defaultValue={term.id}>{data.terms.map((termOption) => <option key={termOption.id} value={termOption.id}>{termOption.name}</option>)}</select></label>
            <label><span>Class</span><select name="classId" defaultValue={params.classId ?? ""}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
            <button className="report-button primary" type="submit">Open class <ArrowRight aria-hidden="true" /></button>
          </form>
        </section>

        {!data.selectedClass ? (
          <section className="report-empty-state compact">
            <div className="report-empty-icon"><GraduationCap aria-hidden="true" /></div>
            <span className="report-eyebrow">NEXT</span>
            <h2>Choose a class to begin</h2>
            <p>The workspace will show coverage, report status and the learner queue for that class.</p>
          </section>
        ) : (
          <>
            <section className="report-metrics">
              <article className="report-metric feature"><div className="report-metric-icon"><GraduationCap aria-hidden="true" /></div><div><span>Active learners</span><strong>{learnerCount}</strong><small>Currently in {data.selectedClass?.name ?? ""}</small></div></article>
              <article className="report-metric"><div className="report-metric-icon"><FileCheck2 aria-hidden="true" /></div><div><span>Generated</span><strong>{reportCount}<em>/{learnerCount}</em></strong><small>{coverage}% coverage</small></div></article>
              <article className="report-metric"><div className="report-metric-icon"><Clock3 aria-hidden="true" /></div><div><span>For approval</span><strong>{submitted}</strong><small>{drafts} draft{drafts === 1 ? "" : "s"} still in class</small></div></article>
              <article className="report-metric"><div className="report-metric-icon"><Send aria-hidden="true" /></div><div><span>Released</span><strong>{released}<em>/{learnerCount}</em></strong><small>{approved} approved and waiting to release</small></div></article>
            </section>

            <section className="report-command-grid">
              <div className="report-command-card primary-command">
                <div className="report-command-number">01</div>
                <div className="report-command-copy"><span className="report-eyebrow">PREPARE</span><h2>Complete the class before reviewing individuals.</h2><p>Generating reports only creates missing records. Existing report cards are never replaced by this step.</p></div>
                <div className="report-command-progress"><div className="report-progress-track"><span style={{ width: `${coverage}%` }} /></div><strong>{reportCount} of {learnerCount}</strong><small>{missing ? `${missing} missing` : "Class fully generated"}</small></div>
                <div className="report-command-actions">{data.permissions.generate ? <form action={runReportCardAction}><input type="hidden" name="action" value="generate" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><button className="report-button primary" type="submit" disabled={!missing}>{missing ? `Generate ${missing} missing` : "All reports generated"} <ArrowRight aria-hidden="true" /></button></form> : null}<Link className="report-secondary-link" href="/school/gradebook/studio">Review marks first <ArrowRight aria-hidden="true" /></Link></div>
              </div>

              <aside className="report-side-card">
                <span className="report-eyebrow">PUBLISHING FLOW</span>
                <div className="report-pipeline">
                  <div className="is-active"><span>01</span><strong>Draft</strong><small>Teacher work</small></div>
                  <i>→</i>
                  <div><span>02</span><strong>For approval</strong><small>Review</small></div>
                  <i>→</i>
                  <div><span>03</span><strong>Approved</strong><small>Authorised</small></div>
                  <i>→</i>
                  <div><span>04</span><strong>Released</strong><small>Family access</small></div>
                </div>
              </aside>
            </section>

            <section className="report-queue-card">
              <div className="report-queue-head">
                <div><span className="report-eyebrow">02 · REVIEW & MOVE</span><h2>Learner report queue</h2><p>Every row has one clear next action. Preview is always available.</p></div>
                <div className="report-queue-summary"><strong>{reportCount}</strong><span>report{reportCount === 1 ? "" : "s"}</span></div>
              </div>

              {data.reports.length ? (
                <div className="report-learner-list">
                  {data.reports.map((report) => {
                    const status = String(report.status);
                    const nextLabel = status === "draft" && data.permissions.submit ? "Submit" : status === "submitted" && data.permissions.approve ? "Approve" : status === "approved" && data.permissions.approve ? "Release" : status === "sent" ? "Released" : "View state";
                    return (
                      <article className={`report-learner-row status-${status}`} key={report.id}>
                        <div className="report-learner-avatar">{report.student.name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}</div>
                        <div className="report-learner-main"><div className="report-learner-name"><strong>{report.student.name}</strong><span>{report.student.admissionNo}</span></div><div className="report-status-line"><span className="report-status-icon">{statusIcon(status)}</span><span><b>{statusLabel[status] ?? status}</b><small>{statusHint[status] ?? "Current report state"}</small></span></div></div>
                        <div className="report-learner-date"><span>CREATED</span><strong>{new Date(report.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</strong></div>
                        <div className="report-learner-actions">
                          <Link href={`/school/report-cards/${report.id}/print`} className="report-row-link">Preview <ArrowRight aria-hidden="true" /></Link>
                          {status === "draft" && data.permissions.submit ? <form action={runReportCardAction}><input type="hidden" name="action" value="submit" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-row-action" type="submit">{nextLabel}</button></form> : null}
                          {status === "submitted" && data.permissions.approve ? <form action={runReportCardAction}><input type="hidden" name="action" value="approve" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-row-action" type="submit">{nextLabel}</button></form> : null}
                          {status === "approved" && data.permissions.approve ? <form action={runReportCardAction}><input type="hidden" name="action" value="release" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-row-action" type="submit">{nextLabel}</button></form> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="report-list-empty"><div className="report-empty-icon"><ClipboardList aria-hidden="true" /></div><strong>No report records yet.</strong><span>Use the prepare action above to generate the missing learner records.</span></div>
              )}
            </section>

            <section className="report-footer-rail">
              <div><Download aria-hidden="true" /><span><strong>Need the source data?</strong><small>Open exports and archive tools without leaving reporting.</small></span></div>
              <Link href="/school/downloads">Open Downloads <ArrowRight aria-hidden="true" /></Link>
              <Link href="/school/settings">Report settings <ArrowRight aria-hidden="true" /></Link>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

const REPORT_CARDS_STYLES = `
.report-cards-page{width:100%;max-width:1540px;margin:0 auto;padding:6px 0 34px;color:var(--report-ink,#dcebe7)}
.report-cards-page,.report-cards-page *{box-sizing:border-box}
.report-cards-page a{text-decoration:none}
.report-cards-page h1,.report-cards-page h2,.report-cards-page p{margin:0}
.report-eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#618086}
.report-eyebrow i{font-style:normal;color:#2ea883}
.report-notice{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;border:1px solid rgba(53,223,171,.22);background:rgba(53,223,171,.08);color:#8de8cc;font-size:11px;font-weight:800;margin-bottom:14px}
.report-notice svg{width:16px;height:16px;flex:none}
.report-hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(290px,.7fr);gap:20px;align-items:stretch;margin-bottom:14px}
.report-hero-copy{position:relative;overflow:hidden;padding:28px 30px;border:1px solid rgba(90,119,127,.18);border-radius:24px;background:radial-gradient(circle at 86% 18%,rgba(53,223,171,.12),transparent 31%),linear-gradient(135deg,rgba(16,38,51,.98),rgba(8,23,33,.99));box-shadow:0 22px 65px rgba(0,0,0,.16)}
.report-hero-copy:after{content:"";position:absolute;width:280px;height:280px;right:-150px;bottom:-180px;border-radius:50%;border:1px solid rgba(111,125,255,.13)}
.report-hero-copy h1{max-width:760px;margin-top:11px;font-size:38px;line-height:1.03;letter-spacing:-.045em;color:#f3faf8}
.report-hero-copy p{max-width:740px;margin-top:12px;font-size:13px;line-height:1.75;color:#7e969a}
.report-hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.report-primary-link,.report-secondary-link,.report-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border-radius:12px;font-size:10px;font-weight:900;transition:transform .18s ease,background .18s ease,border-color .18s ease}
.report-primary-link{background:#35dfab;color:#06251d;box-shadow:0 12px 24px rgba(53,223,171,.1)}
.report-secondary-link{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#a0b8ba}
.report-primary-link:hover,.report-secondary-link:hover,.report-button:hover,.report-row-link:hover,.report-row-action:hover{transform:translateY(-1px)}
.report-primary-link svg,.report-secondary-link svg,.report-button svg,.report-row-link svg,.report-row-action svg,.report-footer-rail svg{width:14px;height:14px}
.report-hero-visual{display:flex;align-items:center;justify-content:center;gap:20px;min-height:220px;padding:24px;border-radius:24px;border:1px solid rgba(90,119,127,.18);background:linear-gradient(150deg,rgba(19,41,53,.96),rgba(9,23,32,.99))}
.report-ring{--progress:0%;width:150px;height:150px;flex:none;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#35dfab var(--progress),rgba(255,255,255,.07) 0)}
.report-ring:before{content:"";width:114px;height:114px;border-radius:50%;background:#0d202b;border:1px solid rgba(255,255,255,.06);grid-area:1/1}
.report-ring>div{grid-area:1/1;display:flex;flex-direction:column;align-items:center;position:relative;z-index:1}
.report-ring strong{font-size:31px;line-height:1;letter-spacing:-.05em;color:#f5fbf9}
.report-ring span{margin-top:5px;color:#6d858a;font-size:9px;text-transform:uppercase;letter-spacing:.14em;font-weight:900}
.report-hero-visual-copy{min-width:0}.report-hero-visual-copy>span{display:block;color:#618087;font-size:9px;font-weight:900;letter-spacing:.15em}.report-hero-visual-copy>strong{display:block;margin-top:8px;font-size:18px;letter-spacing:-.025em;color:#b7ebe0}.report-hero-visual-copy>small{display:block;margin-top:8px;color:#637d82;font-size:10px;line-height:1.5}
.report-context-card{display:grid;grid-template-columns:minmax(220px,.65fr) minmax(0,1.35fr);gap:18px;align-items:end;padding:16px;border:1px solid rgba(90,119,127,.17);border-radius:20px;background:rgba(9,23,32,.82);margin-bottom:14px}
.report-context-label{min-width:0;padding:0 4px 3px}.report-context-label strong{display:block;margin-top:5px;color:#edf7f4;font-size:17px;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.report-context-label small{display:block;margin-top:4px;color:#60787e;font-size:9px}
.report-selects{display:grid;grid-template-columns:1fr 1.2fr auto;gap:8px;align-items:end}.report-selects label{display:grid;gap:6px}.report-selects label>span{font-size:9px;font-weight:850;color:#6e878b;text-transform:uppercase;letter-spacing:.11em}.report-selects select{width:100%;height:40px;padding:0 12px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.035);color:#d8e7e4;font-size:10px}.report-button{border:0;cursor:pointer}.report-button.primary{background:#35dfab;color:#06251d}.report-button:disabled{opacity:.5;cursor:not-allowed;transform:none}
.report-empty-state{display:grid;justify-items:center;text-align:center;min-height:330px;padding:44px 24px;border-radius:24px;border:1px dashed rgba(90,119,127,.22);background:linear-gradient(145deg,rgba(16,34,45,.8),rgba(8,22,31,.9))}.report-empty-state.compact{min-height:250px;margin-top:6px}.report-empty-state h1,.report-empty-state h2{margin-top:12px;color:#f2faf7;letter-spacing:-.035em}.report-empty-state h1{font-size:24px}.report-empty-state h2{font-size:20px}.report-empty-state p{max-width:560px;margin-top:8px;color:#6e878c;font-size:11px;line-height:1.7}.report-empty-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:17px;border:1px solid rgba(53,223,171,.17);background:rgba(53,223,171,.07);color:#62e3bd}.report-empty-icon svg{width:24px;height:24px}.report-empty-state .report-primary-link{margin-top:16px}
.report-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.report-metric{display:flex;align-items:center;gap:12px;padding:16px;border:1px solid rgba(90,119,127,.17);border-radius:18px;background:linear-gradient(145deg,rgba(16,35,46,.92),rgba(8,22,31,.98))}.report-metric.feature{background:linear-gradient(135deg,rgba(20,52,55,.94),rgba(9,27,35,.98));border-color:rgba(53,223,171,.14)}.report-metric-icon{width:38px;height:38px;display:grid;place-items:center;flex:none;border-radius:12px;background:rgba(53,223,171,.08);color:#64dfbc}.report-metric-icon svg{width:18px;height:18px}.report-metric span,.report-metric small{display:block}.report-metric span{color:#6b8388;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.report-metric strong{display:block;margin-top:4px;font-size:24px;line-height:1;letter-spacing:-.04em;color:#edf8f4}.report-metric strong em{font-style:normal;color:#5e787e;font-size:11px;margin-left:2px}.report-metric small{margin-top:5px;color:#5b747a;font-size:8px}
.report-command-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(330px,.72fr);gap:12px;margin-bottom:14px}.report-command-card,.report-side-card,.report-queue-card{border:1px solid rgba(90,119,127,.17);border-radius:20px;background:linear-gradient(145deg,rgba(15,34,45,.96),rgba(8,22,31,.99))}.report-command-card{position:relative;padding:22px}.report-command-number{position:absolute;right:20px;top:16px;font-size:55px;line-height:1;font-weight:950;letter-spacing:-.06em;color:rgba(255,255,255,.035)}.report-command-copy{max-width:650px}.report-command-copy h2{margin-top:6px;color:#f1faf7;font-size:21px;letter-spacing:-.035em}.report-command-copy p{max-width:600px;margin-top:7px;color:#6c858a;font-size:10px;line-height:1.65}.report-command-progress{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:center;margin-top:18px}.report-progress-track{height:8px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.06)}.report-progress-track span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#35dfab,#68e4c0);box-shadow:0 0 18px rgba(53,223,171,.22)}.report-command-progress strong{font-size:11px;color:#b1ebe0}.report-command-progress small{color:#5e777d;font-size:9px}.report-command-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}.report-command-actions form{margin:0}.report-command-actions .report-secondary-link{min-height:40px}
.report-side-card{padding:19px}.report-pipeline{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:7px;align-items:center;margin-top:15px}.report-pipeline>div{min-width:0;padding:9px;border-radius:12px;border:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.022)}.report-pipeline>div.is-active{border-color:rgba(53,223,171,.13);background:rgba(53,223,171,.055)}.report-pipeline div span{display:block;color:#546f76;font-size:7px;font-weight:900}.report-pipeline div strong{display:block;margin-top:5px;color:#9ab3b5;font-size:8px;white-space:nowrap}.report-pipeline div small{display:block;margin-top:3px;color:#526b71;font-size:7px}.report-pipeline i{font-style:normal;color:#3e5b61;text-align:center}
.report-queue-card{overflow:hidden}.report-queue-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:21px 22px;border-bottom:1px solid rgba(255,255,255,.05)}.report-queue-head h2{margin-top:5px;color:#edf7f4;font-size:21px;letter-spacing:-.035em}.report-queue-head p{margin-top:5px;color:#647c81;font-size:10px}.report-queue-summary{text-align:right}.report-queue-summary strong{display:block;color:#f1faf7;font-size:25px;letter-spacing:-.05em}.report-queue-summary span{color:#5c757b;font-size:8px;text-transform:uppercase;letter-spacing:.12em;font-weight:900}
.report-learner-list{display:grid}.report-learner-row{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(95px,.18fr) auto;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.045)}.report-learner-row:last-child{border-bottom:0}.report-learner-row:hover{background:rgba(255,255,255,.018)}.report-learner-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,rgba(53,223,171,.12),rgba(111,125,255,.1));border:1px solid rgba(255,255,255,.05);color:#8fe6d0;font-size:10px;font-weight:950}.report-learner-main{min-width:0}.report-learner-name{display:flex;align-items:baseline;gap:9px;min-width:0}.report-learner-name strong{color:#e9f5f1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.report-learner-name span{color:#5c7479;font-size:8px;white-space:nowrap}.report-status-line{display:flex;align-items:center;gap:7px;margin-top:6px}.report-status-icon{width:20px;height:20px;display:grid;place-items:center;border-radius:7px;background:rgba(255,255,255,.035);color:#799297}.report-status-icon svg{width:11px;height:11px}.status-draft .report-status-icon{color:#9eabb0}.status-submitted .report-status-icon{color:#e0c878}.status-approved .report-status-icon{color:#9da7ff}.status-sent .report-status-icon{color:#62e3bd}.report-status-line b{display:block;color:#9eb5b6;font-size:8px}.report-status-line small{display:block;margin-top:2px;color:#5a7379;font-size:7px}.report-learner-date{text-align:right}.report-learner-date span{display:block;color:#4f696f;font-size:7px;letter-spacing:.11em;font-weight:900}.report-learner-date strong{display:block;margin-top:4px;color:#82999c;font-size:8px}.report-learner-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:190px}.report-learner-actions form{margin:0}.report-row-link,.report-row-action{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:0 10px;border-radius:10px;font-size:8px;font-weight:900;transition:transform .18s ease}.report-row-link{border:1px solid rgba(255,255,255,.07);color:#8ca3a5;background:rgba(255,255,255,.025)}.report-row-action{border:1px solid rgba(53,223,171,.14);background:rgba(53,223,171,.08);color:#72e2c1;cursor:pointer}.status-sent .report-row-action{display:none}
.report-list-empty{display:grid;justify-items:center;text-align:center;padding:50px 24px}.report-list-empty .report-empty-icon{margin-bottom:10px}.report-list-empty strong{color:#edf7f4;font-size:12px}.report-list-empty span{margin-top:5px;color:#5e777c;font-size:9px}
.report-footer-rail{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;margin-top:14px;padding:13px 15px;border-radius:16px;border:1px solid rgba(90,119,127,.15);background:rgba(9,23,32,.78)}.report-footer-rail>div{display:flex;align-items:center;gap:10px}.report-footer-rail>div>svg{width:17px;height:17px;color:#68e2be}.report-footer-rail strong,.report-footer-rail small{display:block}.report-footer-rail strong{color:#a0b6b8;font-size:9px}.report-footer-rail small{margin-top:3px;color:#587177;font-size:7px}.report-footer-rail a{display:inline-flex;align-items:center;gap:7px;padding:9px 10px;border-radius:10px;color:#7f989a;font-size:8px;font-weight:850;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05)}

:root[data-theme="light"] .report-cards-page{--report-ink:#183238;color:#183238}
:root[data-theme="light"] .report-hero-copy{background:radial-gradient(circle at 88% 16%,rgba(41,174,144,.14),transparent 31%),linear-gradient(135deg,#ffffff,#f6fbf9);border-color:#dbe8e6;box-shadow:0 18px 50px rgba(25,70,64,.08)}
:root[data-theme="light"] .report-hero-copy h1,:root[data-theme="light"] .report-command-copy h2,:root[data-theme="light"] .report-queue-head h2,:root[data-theme="light"] .report-empty-state h1,:root[data-theme="light"] .report-empty-state h2,:root[data-theme="light"] .report-metric strong,:root[data-theme="light"] .report-learner-name strong{color:#163038}
:root[data-theme="light"] .report-hero-copy p,:root[data-theme="light"] .report-command-copy p,:root[data-theme="light"] .report-queue-head p,:root[data-theme="light"] .report-empty-state p{color:#6b8083}
:root[data-theme="light"] .report-hero-visual,.report-cards-page:where(:root[data-theme="light"]) .report-context-card,:root[data-theme="light"] .report-command-card,:root[data-theme="light"] .report-side-card,:root[data-theme="light"] .report-queue-card,:root[data-theme="light"] .report-metric,:root[data-theme="light"] .report-footer-rail{background:linear-gradient(145deg,#ffffff,#f7fbfa);border-color:#dbe8e6;box-shadow:0 12px 35px rgba(26,75,69,.06)}
:root[data-theme="light"] .report-context-label strong,:root[data-theme="light"] .report-selects select{color:#183238}
:root[data-theme="light"] .report-selects select{background:#fff;border-color:#d6e4e1}
:root[data-theme="light"] .report-ring:before{background:#fff;border-color:#e5efed}
:root[data-theme="light"] .report-hero-visual-copy>strong{color:#226d5b}
:root[data-theme="light"] .report-pipeline>div{background:#f7fbfa;border-color:#dfeae8}
:root[data-theme="light"] .report-pipeline>div.is-active{background:#edf9f5;border-color:#bfe6d9}
:root[data-theme="light"] .report-pipeline div strong{color:#557177}
:root[data-theme="light"] .report-learner-row{border-bottom-color:#e5eeec}
:root[data-theme="light"] .report-learner-row:hover{background:#f8fbfa}
:root[data-theme="light"] .report-learner-name span,:root[data-theme="light"] .report-learner-date strong,:root[data-theme="light"] .report-status-line small{color:#6a8285}
:root[data-theme="light"] .report-row-link,:root[data-theme="light"] .report-secondary-link{background:#fff;border-color:#dbe7e4;color:#587074}
:root[data-theme="light"] .report-footer-rail a{background:#f8fbfa;border-color:#dfe9e7;color:#5c7478}

@media(max-width:1120px){.report-hero,.report-command-grid{grid-template-columns:1fr}.report-context-card{grid-template-columns:1fr}.report-hero-visual{min-height:190px;justify-content:flex-start}.report-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.report-selects{grid-template-columns:1fr 1fr}.report-selects .report-button{grid-column:1/-1}.report-learner-row{grid-template-columns:auto minmax(0,1fr);gap:10px}.report-learner-date,.report-learner-actions{grid-column:2;justify-content:flex-start;text-align:left}.report-learner-actions{min-width:0;flex-wrap:wrap}.report-footer-rail{grid-template-columns:1fr}.report-footer-rail a{justify-content:space-between}}
@media(max-width:620px){.report-cards-page{padding-bottom:24px}.report-hero-copy{padding:22px 18px}.report-hero-copy h1{font-size:29px}.report-hero-visual{padding:18px;gap:14px}.report-ring{width:120px;height:120px}.report-ring:before{width:90px;height:90px}.report-ring strong{font-size:24px}.report-context-card,.report-command-card,.report-side-card,.report-queue-head{padding:16px}.report-selects{grid-template-columns:1fr}.report-selects .report-button{grid-column:auto}.report-metrics{grid-template-columns:1fr}.report-command-progress{grid-template-columns:minmax(0,1fr) auto}.report-command-progress small{grid-column:2}.report-pipeline{grid-template-columns:1fr 1fr}.report-pipeline i{display:none}.report-hero-actions{flex-direction:column}.report-primary-link,.report-secondary-link{width:100%}.report-learner-date,.report-learner-actions{grid-column:1/-1}.report-learner-avatar{width:36px;height:36px}.report-learner-name{flex-direction:column;gap:2px}.report-learner-actions{display:grid;grid-template-columns:1fr 1fr}.report-row-link,.report-row-action{width:100%}}
`;
