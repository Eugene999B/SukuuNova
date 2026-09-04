import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  if (!termId) throw new Error("Select a reporting term first.");
  if (!classId) throw new Error("Select a class first.");

  if (action === "generate") {
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:generate");
      const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId, status: "active" }, select: { id: true }, orderBy: { name: "asc" } });
      const existing = await tx.reportCard.findMany({ where: { termId, student: { classId } }, select: { studentId: true, status: true } });
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
    else if (action === "approve") await approveAndQueuePublicReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: origin() });
    else if (action === "release") await sendApprovedReportCardPublic(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: origin() });
    else throw new Error("Unsupported report-card action.");
  });
  revalidatePath("/school/report-cards");
  revalidatePath("/school/reports");
  redirect(`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`);
}

const statusLabel: Record<string, string> = { draft: "Draft", submitted: "For approval", approved: "Approved", sent: "Released" };
const statusHint: Record<string, string> = { draft: "Ready to submit", submitted: "Waiting for approval", approved: "Ready to release", sent: "Published" };

function percent(n: number, d: number) {
  return d ? Math.max(0, Math.min(100, Math.round((n / d) * 100))) : 0;
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
      <AppShell universe="school" title="Report Cards" subtitle="Prepare, review, approve and release official student reports in a focused class-by-class workflow." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
        <main className="report-cards-page">
          <section className="report-empty">
            <div className="report-empty-mark">01</div>
            <h2>Set up a reporting term first</h2>
            <p>No academic term is available yet. Create a term in the academic calendar before opening the report-card workflow.</p>
            <Link className="report-text-link" href="/school/terms">Open Terms & Calendar <span>→</span></Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const term = data.term;
  const learnerCount = data.students.length;
  const reportCount = data.reports.length;
  const submitted = data.reports.filter((item) => item.status === "submitted").length;
  const released = data.reports.filter((item) => item.status === "sent").length;
  const missing = Math.max(0, learnerCount - reportCount);

  return (
    <AppShell universe="school" title="Report Cards" subtitle="Prepare, review, approve and release official student reports in a focused class-by-class workflow." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main className="report-cards-page">
        {params.notice ? <div className="report-notice" role="status">{params.notice}</div> : null}
        <section className="report-hero"><div><span className="report-kicker">OFFICIAL ACADEMIC REPORTING</span><h1>{term.name}</h1><p>Work on one class at a time. Check that marks are ready, generate missing report records, then move each report through review, approval and release.</p></div><div className="report-hero-links"><Link href="/school/gradebook/studio">Gradebook</Link><Link href="/school/reports">Archive</Link><Link href="/school/downloads">Downloads</Link></div></section>
        <section className="report-controls"><div><span className="report-kicker">WORKING CONTEXT</span><strong>{data.selectedClass ? `${data.selectedClass.level ? `${data.selectedClass.level} · ` : ""}${data.selectedClass.name}` : "Choose a class"}</strong><small>{term.name}</small></div><form method="get" className="report-selects"><label>Term<select name="term" defaultValue={term.id}>{data.terms.map((termOption) => <option key={termOption.id} value={termOption.id}>{termOption.name}</option>)}</select></label><label>Class<select name="classId" defaultValue={params.classId ?? ""}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label><button className="report-button primary" type="submit">Open class</button></form></section>
        {!data.selectedClass ? <section className="report-empty"><div className="report-empty-mark">01</div><h2>Start with a class</h2><p>Report cards work best as a class workflow. Choose the term and class above to see coverage, readiness and the learner review queue.</p></section> : <>
          <section className="report-summary"><article><span>Learners</span><strong>{learnerCount}</strong><small>Active in class</small></article><article><span>Generated</span><strong>{reportCount}</strong><small>Report records</small></article><article><span>For approval</span><strong>{submitted}</strong><small>Waiting for review</small></article><article><span>Released</span><strong>{released}</strong><small>Published to families</small></article></section>
          <section className="report-workflow"><div className="report-workflow-copy"><span className="report-kicker">01 · PREPARE</span><h2>Make sure the class is ready</h2><p>Report generation creates only missing draft records. Existing reports are left untouched.</p><div className="report-progress-line"><span style={{ width: `${percent(reportCount, learnerCount)}%` }} /></div><small>{reportCount} of {learnerCount} learners have report records · {missing} missing</small></div><div className="report-workflow-action">{data.permissions.generate ? <form action={runReportCardAction}><input type="hidden" name="action" value="generate" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><button className="report-button primary" type="submit" disabled={!missing}>{missing ? `Generate ${missing} missing` : "All reports generated"}</button></form> : null}<Link className="report-text-link" href="/school/gradebook/studio">Review marks in Gradebook <span>→</span></Link></div></section>
          <section className="report-queue"><div className="report-queue-head"><div><span className="report-kicker">02 · REVIEW & MOVE</span><h2>Each report has one next step</h2><p>Preview the learner report, then take only the action allowed by its current state.</p></div></div><div className="report-table-wrap"><table><thead><tr><th>Learner</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{data.reports.map((report) => { const status = String(report.status); return <tr key={report.id}><td><strong>{report.student.name}</strong><small>{report.student.admissionNo}</small></td><td><span className={`report-status ${status}`}>{statusLabel[status] ?? status}</span><small>{statusHint[status] ?? "Current report state"}</small></td><td>{new Date(report.createdAt).toLocaleDateString("en-GH")}</td><td><div className="report-actions"><Link href={`/school/report-cards/${report.id}/print`} className="report-action">Preview</Link>{status === "draft" && data.permissions.submit ? <form action={runReportCardAction}><input type="hidden" name="action" value="submit" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Submit</button></form> : null}{status === "submitted" && data.permissions.approve ? <form action={runReportCardAction}><input type="hidden" name="action" value="approve" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Approve</button></form> : null}{status === "approved" && data.permissions.approve ? <form action={runReportCardAction}><input type="hidden" name="action" value="release" /><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="classId" value={data.selectedClass?.id ?? ""} /><input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Release</button></form> : null}</div></td></tr>; })}{!data.reports.length ? <tr><td colSpan={4}><div className="report-table-empty"><strong>No reports yet.</strong><span>Generate the missing reports above to begin the review queue.</span></div></td></tr> : null}</tbody></table></div></section>
          <section className="report-state-bar"><div><span>WORKFLOW</span><strong>Draft</strong><em>→</em><strong>For approval</strong><em>→</em><strong>Approved</strong><em>→</em><strong>Released</strong></div><Link href="/school/settings">Report-card settings →</Link></section>
        </>}
      </main>
    </AppShell>
  );
}