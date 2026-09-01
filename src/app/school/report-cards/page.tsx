import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { generateReportCard, submitReportCard, approveReportCard, sendReportCard } from "@/lib/report-card-service";

async function runReportCardAction(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const action = String(formData.get("action") ?? "");
  const termId = String(formData.get("termId") ?? "");
  const reportCardId = String(formData.get("reportCardId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  if (!termId) throw new Error("A reporting term is required.");

  let notice = "";
  if (action === "generate-class") {
    if (!classId) throw new Error("Select a class before generating a report run.");
    const selection = await withTenant(session.schoolId, async tx => {
      await requirePermission(tx, session.userId, "reports:generate");
      const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId, status: "active" }, select: { id: true } });
      const existing = await tx.reportCard.findMany({ where: { termId, student: { classId } }, select: { studentId: true, status: true } });
      return { studentIds: students.map(student => student.id), locked: existing.filter(report => report.status !== "draft").map(report => report.studentId), existing: existing.map(report => report.studentId) };
    });
    const locked = new Set(selection.locked);
    const existing = new Set(selection.existing);
    let generated = 0; let skipped = 0; let failed = 0;
    for (const studentId of selection.studentIds) {
      if (locked.has(studentId)) { skipped++; continue; }
      if (existing.has(studentId)) continue;
      try {
        await withTenant(session.schoolId, tx => generateReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, studentId, termId }));
        generated++;
      } catch {
        failed++;
      }
    }
    notice = `Generated ${generated} report${generated === 1 ? "" : "s"}. ${failed ? `${failed} could not be generated; review readiness and missing scores.` : ""}${skipped ? ` ${skipped} locked report${skipped === 1 ? " was" : "s were"} left unchanged.` : ""}`.trim();
  } else if (action === "generate-student") {
    const studentId = String(formData.get("studentId") ?? "");
    if (!studentId) throw new Error("A student is required.");
    await withTenant(session.schoolId, tx => generateReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, studentId, termId }));
    notice = "Report generated.";
  } else if (action === "submit") {
    if (!reportCardId) throw new Error("A report is required.");
    await withTenant(session.schoolId, tx => submitReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId }));
    notice = "Report submitted for review.";
  } else if (action === "approve") {
    if (!reportCardId) throw new Error("A report is required.");
    await withTenant(session.schoolId, tx => approveReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId }));
    notice = "Report approved.";
  } else if (action === "send") {
    if (!reportCardId) throw new Error("A report is required.");
    await withTenant(session.schoolId, tx => sendReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId }));
    notice = "Report released to the family portal.";
  } else {
    throw new Error("Unsupported report-card action.");
  }

  revalidatePath("/school/report-cards");
  revalidatePath("/school/reports");
  redirect(`/school/report-cards?term=${encodeURIComponent(termId)}${classId ? `&classId=${encodeURIComponent(classId)}` : ""}&notice=${encodeURIComponent(notice)}`);
}

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; status?: string; notice?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async tx => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, templates, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 8, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.reportCardTemplate.findMany({ where: { OR: [{ schoolId: session.schoolId }, { schoolId: null }] }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, schoolId: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ where: { schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, admissionNo: true, classId: true }, orderBy: { name: "asc" } }),
    ]);
    const term = terms.find(item => item.id === params.term) ?? terms[0];
    const baseWhere = term ? { termId: term.id, ...(params.classId ? { student: { classId: params.classId } } : {}) } : undefined;
    const reportWhere = term ? { ...baseWhere!, ...(params.status ? { status: params.status } : {}) } : undefined;
    const [allReports, reports] = term ? await Promise.all([
      tx.reportCard.findMany({ where: baseWhere, select: { id: true, studentId: true, status: true, student: { select: { classId: true } }, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
      tx.reportCard.findMany({ where: reportWhere, select: { id: true, studentId: true, status: true, student: { select: { name: true, admissionNo: true, classId: true, class: { select: { name: true, level: true } } } }, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    ]) : [[], []];
    const [canGenerate, canSubmit, canApprove] = await Promise.all([
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
    ]);
    return { school, terms, term, templates, classes, students, allReports, reports, canGenerate, canSubmit, canApprove };
  });

  if (!data.school) return null;
  const counts = { draft: data.allReports.filter(r => r.status === "draft").length, submitted: data.allReports.filter(r => r.status === "submitted").length, approved: data.allReports.filter(r => r.status === "approved").length, sent: data.allReports.filter(r => r.status === "sent").length };
  const classCounts = new Map<string, { total: number; draft: number; submitted: number; approved: number; sent: number; missing: number }>();
  for (const student of data.students) {
    if (!student.classId) continue;
    const x = classCounts.get(student.classId) ?? { total: 0, draft: 0, submitted: 0, approved: 0, sent: 0, missing: 0 };
    x.total++;
    classCounts.set(student.classId, x);
  }
  for (const report of data.allReports) {
    if (!report.student.classId) continue;
    const x = classCounts.get(report.student.classId) ?? { total: 0, draft: 0, submitted: 0, approved: 0, sent: 0, missing: 0 };
    if (report.status in x) (x as Record<string, number>)[report.status]++;
    classCounts.set(report.student.classId, x);
  }
  for (const x of classCounts.values()) x.missing = Math.max(0, x.total - x.draft - x.submitted - x.approved - x.sent);

  return <AppShell universe="school" title="Report Card Studio" subtitle="Select one reporting context, verify results, choose a presentation, then generate and move reports through the approval chain." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace">
      {params.notice ? <div className="inline-result success" role="status">{params.notice}</div> : null}
      <section className="module-setup-card module-card"><div><span className="module-overline">Term reporting · {data.canApprove ? "Approver / leadership" : data.canSubmit ? "Class teacher / submitter" : "Viewer"}</span><h3>Reporting command centre</h3><p>Reporting is organised around a term and class. The actions below call the same audited service layer used by the API.</p></div><div className="module-setup-list"><Link href="/school/academics/health"><span>1</span>Readiness <b>Check blockers</b></Link><Link href="/school/gradebook/studio"><span>2</span>Results <b>Complete marks</b></Link><Link href="#templates"><span>3</span>Presentation <b>{data.templates.length} templates</b></Link><span><b>4</b> Workflow <strong>Generate → Submit → Approve → Release</strong></span></div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Reporting context</span><h3>Choose term and class</h3><p>All generation is scoped to one term and class. Status filters only change the recent-record list.</p></div></div><form className="module-toolbar" action="/school/report-cards" method="get"><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}}>Term<select name="term" defaultValue={data.term?.id ?? ""}>{data.terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}}>Class<select name="classId" defaultValue={params.classId ?? ""}><option value="">All classes</option>{data.classes.map(c => <option key={c.id} value={c.id}>{c.level ? `${c.level} · ` : ""}{c.name}</option>)}</select></label><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}}>Status<select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">For review</option><option value="approved">Approved</option><option value="sent">Released</option></select></label><button className="button primary" type="submit">Load reporting view</button></form></section>
      <section className="module-metrics"><article><span>Draft</span><strong>{counts.draft}</strong><small>Actual reports</small></article><article><span>For review</span><strong>{counts.submitted}</strong><small>Awaiting approval</small></article><article><span>Approved</span><strong>{counts.approved}</strong><small>Ready to release</small></article><article><span>Released</span><strong>{counts.sent}</strong><small>Published to families</small></article></section>
      <section className="module-card" id="templates"><div className="module-section-title"><div><span>Presentation</span><h3>Report-card templates</h3><p>Choose presentation independently from academic calculations.</p></div></div><div className="module-selector-grid">{data.templates.length ? data.templates.map(t => <div className="module-selector-card" key={t.id}><strong>{t.name}</strong><span>{t.schoolId ? "School template" : "SukuuNova preset"}</span><small>Identity · results · remarks · signatures · Ghanaian A4 layout</small></div>) : <div className="module-empty"><strong>No templates available.</strong><span>Select a report-card template before generation.</span></div>}</div></section>
      <section className="module-card" id="batch"><div className="module-section-title"><div><span>Class runs</span><h3>{data.term?.name ?? "No term selected"}</h3><p>Generate only missing report records. Existing non-draft reports remain locked.</p></div></div><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Class</th><th>Learners</th><th>Missing</th><th>Draft</th><th>Review</th><th>Approved</th><th>Released</th><th>Action</th></tr></thead><tbody>{data.classes.map(c => { const x = classCounts.get(c.id) ?? { total: 0, draft: 0, submitted: 0, approved: 0, sent: 0, missing: 0 }; return <tr key={c.id}><td><strong>{c.level ? `${c.level} · ` : ""}{c.name}</strong></td><td>{c._count.students}</td><td>{x.missing}</td><td>{x.draft}</td><td>{x.submitted}</td><td>{x.approved}</td><td>{x.sent}</td><td><div className="modal-actions">{data.canGenerate && x.missing > 0 && data.term ? <form action={runReportCardAction}><input type="hidden" name="action" value="generate-class"/><input type="hidden" name="classId" value={c.id}/><input type="hidden" name="termId" value={data.term.id}/><button className="app-action" type="submit"><strong>Generate</strong> missing</button></form> : null}<Link className="app-action" href={`/school/report-cards?classId=${encodeURIComponent(c.id)}&term=${encodeURIComponent(data.term?.id ?? "")}`}><strong>Open</strong> workflow</Link></div></td></tr> })}{!data.classes.length ? <tr><td colSpan={8}><div className="module-empty"><strong>Create classes first.</strong><span>Report runs need an academic class context.</span></div></td></tr> : null}</tbody></table></div></section>
      <section className="module-card"><div className="module-section-title"><div><span>Recent reports</span><h3>Actual report records</h3><p>{data.reports.length} records in the selected filter.</p></div></div><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>Created</th><th>Workflow</th></tr></thead><tbody>{data.reports.slice(0, 100).map(r => <tr key={r.id}><td><strong>{r.student.name}</strong><small>{r.student.admissionNo}</small></td><td>{r.student.class ? `${r.student.class.level ?? ""}${r.student.class.level ? " · " : ""}${r.student.class.name}` : "Unplaced"}</td><td><span className="app-pill">{r.status}</span></td><td>{new Date(r.createdAt).toLocaleDateString("en-GH")}</td><td><div className="modal-actions">{r.status === "draft" && data.canSubmit ? <form action={runReportCardAction}><input type="hidden" name="action" value="submit"/><input type="hidden" name="reportCardId" value={r.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><button className="app-action" type="submit"><strong>Submit</strong></button></form> : null}{r.status === "submitted" && data.canApprove ? <form action={runReportCardAction}><input type="hidden" name="action" value="approve"/><input type="hidden" name="reportCardId" value={r.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><button className="app-action" type="submit"><strong>Approve</strong></button></form> : null}{r.status === "approved" && data.canApprove ? <form action={runReportCardAction}><input type="hidden" name="action" value="send"/><input type="hidden" name="reportCardId" value={r.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><button className="app-action" type="submit"><strong>Release</strong></button></form> : null}{r.status === "approved" || r.status === "sent" ? <Link className="app-action" href={`/school/report-cards/${r.id}/print`}><strong>Print</strong></Link> : null}</div></td></tr>)}{!data.reports.length ? <tr><td colSpan={5}><div className="module-empty"><strong>No reports in this context.</strong><span>Generate the selected class run when readiness and scores allow it.</span></div></td></tr> : null}</tbody></table></div></section>
    </div>
  </AppShell>;
}
