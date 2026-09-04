import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { generateReportCard, submitReportCard } from "@/lib/report-card-service";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";

function requestOrigin() {
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

  let notice = "";
  if (action === "generate-class") {
    if (!classId) throw new Error("Select a class before generating reports.");
    const selection = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "reports:generate");
      const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId, status: "active" }, select: { id: true }, orderBy: { name: "asc" } });
      const existing = await tx.reportCard.findMany({ where: { termId, student: { classId } }, select: { studentId: true, status: true } });
      return { studentIds: students.map((student) => student.id), existing: new Set(existing.map((report) => report.studentId)), locked: new Set(existing.filter((report) => report.status !== "draft").map((report) => report.studentId)) };
    });
    let generated = 0; let skipped = 0; let failed = 0;
    for (const studentId of selection.studentIds) {
      if (selection.locked.has(studentId)) { skipped++; continue; }
      if (selection.existing.has(studentId)) continue;
      try {
        await withTenant(session.schoolId, (tx) => generateReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, studentId, termId }));
        generated++;
      } catch { failed++; }
    }
    notice = `Generated ${generated} report${generated === 1 ? "" : "s"}.`;
    if (failed) notice += ` ${failed} could not be generated; check gradebook readiness.`;
    if (skipped) notice += ` ${skipped} locked report${skipped === 1 ? " was" : "s were"} left unchanged.`;
  } else if (action === "submit") {
    if (!reportCardId) throw new Error("A report card is required.");
    await withTenant(session.schoolId, (tx) => submitReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId }));
    notice = "Report submitted for approval.";
  } else if (action === "approve") {
    if (!reportCardId) throw new Error("A report card is required.");
    await withTenant(session.schoolId, (tx) => approveAndQueuePublicReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: requestOrigin() }));
    notice = "Report approved and ready for release.";
  } else if (action === "send") {
    if (!reportCardId) throw new Error("A report card is required.");
    await withTenant(session.schoolId, (tx) => sendApprovedReportCardPublic(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: requestOrigin() }));
    notice = "Report released through the configured family delivery flow.";
  } else {
    throw new Error("Unsupported report-card action.");
  }

  revalidatePath("/school/report-cards");
  revalidatePath("/school/reports");
  redirect(`/school/report-cards?term=${encodeURIComponent(termId)}${classId ? `&classId=${encodeURIComponent(classId)}` : ""}&notice=${encodeURIComponent(notice)}`);
}

const statusMeta: Record<string, { label: string; hint: string; next: string }> = {
  draft: { label: "Draft", hint: "Generated but not submitted", next: "Submit" },
  submitted: { label: "For approval", hint: "Waiting for academic approval", next: "Approve" },
  approved: { label: "Approved", hint: "Final and ready to release", next: "Release" },
  sent: { label: "Released", hint: "Published to families", next: "Preview" },
};

function pct(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; status?: string; notice?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, classes, students, settings, templates] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 12, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ where: { schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, admissionNo: true, classId: true }, orderBy: { name: "asc" } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardTemplateId: true, allowPartialReportCards: true, gradeCaWeight: true, gradeExamWeight: true, notificationChannels: true } }),
      tx.reportCardTemplate.findMany({ where: { OR: [{ schoolId: session.schoolId }, { schoolId: null }] }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, schoolId: true } }),
    ]);

    const term = terms.find((item) => item.id === params.term) ?? terms[0];
    const baseWhere = term ? { termId: term.id, ...(params.classId ? { student: { classId: params.classId } } : {}) } : undefined;
    const reportWhere = term ? { ...baseWhere!, ...(params.status ? { status: params.status } : {}) } : undefined;

    const [allReports, reports] = term ? await Promise.all([
      tx.reportCard.findMany({ where: term ? { termId: term.id } : undefined, select: { id: true, studentId: true, status: true, student: { select: { classId: true } }, createdAt: true }, orderBy: { createdAt: "desc" }, take: 3000 }),
      tx.reportCard.findMany({ where: reportWhere, select: { id: true, studentId: true, status: true, createdAt: true, student: { select: { name: true, admissionNo: true, classId: true, class: { select: { name: true, level: true } } } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 }),
    ]) : [[], []];

    const selectedClass = params.classId ? classes.find((item) => item.id === params.classId) ?? null : null;
    const selectedClassStudents = selectedClass ? students.filter((student) => student.classId === selectedClass.id) : [];
    const selectedClassReports = selectedClass ? allReports.filter((report) => report.student.classId === selectedClass.id) : [];
    const selectedClassAssessments = selectedClass && term ? await tx.assessment.count({ where: { termId: term.id, classId: selectedClass.id } }) : 0;
    const selectedClassScores = selectedClass && term ? await tx.score.count({ where: { assessment: { termId: term.id, classId: selectedClass.id }, student: { schoolId: session.schoolId, status: "active" } } }) : 0;

    const [canGenerate, canSubmit, canApprove] = await Promise.all([
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
    ]);

    return { school, terms, term, classes, students, settings, templates, allReports, reports, selectedClass, selectedClassStudents, selectedClassReports, selectedClassAssessments, selectedClassScores, canGenerate, canSubmit, canApprove };
  });

  if (!data.school) return null;

  const overall = {
    totalLearners: data.students.length,
    reports: data.allReports.length,
    draft: data.allReports.filter((r) => r.status === "draft").length,
    submitted: data.allReports.filter((r) => r.status === "submitted").length,
    approved: data.allReports.filter((r) => r.status === "approved").length,
    sent: data.allReports.filter((r) => r.status === "sent").length,
  };

  const selected = {
    learners: data.selectedClassStudents.length,
    reports: data.selectedClassReports.length,
    draft: data.selectedClassReports.filter((r) => r.status === "draft").length,
    submitted: data.selectedClassReports.filter((r) => r.status === "submitted").length,
    approved: data.selectedClassReports.filter((r) => r.status === "approved").length,
    sent: data.selectedClassReports.filter((r) => r.status === "sent").length,
  };
  const missingReports = Math.max(0, selected.learners - selected.reports);
  const expectedScores = selected.learners * data.selectedClassAssessments;
  const missingScores = Math.max(0, expectedScores - data.selectedClassScores);
  const gradebookCompletion = expectedScores ? pct((data.selectedClassScores / expectedScores) * 100) : 0;
  const reportCoverage = selected.learners ? pct((selected.reports / selected.learners) * 100) : 0;
  const generationBlocked = Boolean(data.selectedClass && (!data.selectedClassAssessments || (missingScores > 0 && !data.settings?.allowPartialReportCards)));
  const activeTemplate = data.templates.find((template) => template.id === data.settings?.reportCardTemplateId) ?? data.templates.find((template) => !template.schoolId) ?? data.templates[0];
  const channels = data.settings?.notificationChannels && typeof data.settings.notificationChannels === "object" && !Array.isArray(data.settings.notificationChannels) ? data.settings.notificationChannels : null;
  const releaseChannels = channels && Array.isArray((channels as Record<string, unknown>).channels) ? ((channels as Record<string, unknown>).channels as unknown[]).filter((value): value is string => typeof value === "string") : [];

  const classRows = data.classes.map((cls) => {
    const classLearners = cls._count.students;
    const classReports = data.allReports.filter((r) => r.student.classId === cls.id);
    const draft = classReports.filter((r) => r.status === "draft").length;
    const submitted = classReports.filter((r) => r.status === "submitted").length;
    const approved = classReports.filter((r) => r.status === "approved").length;
    const sent = classReports.filter((r) => r.status === "sent").length;
    const missing = Math.max(0, classLearners - classReports.length);
    const next = missing > 0 ? `Generate ${missing}` : submitted > 0 ? `Review ${submitted}` : approved > 0 ? `Release ${approved}` : sent === classLearners && classLearners > 0 ? "Complete" : "Open";
    return { cls, classLearners, classReports, draft, submitted, approved, sent, missing, next, coverage: classLearners ? pct((classReports.length / classLearners) * 100) : 0 };
  });

  return (
    <AppShell universe="school" title="Report Cards" subtitle="Prepare, review, approve and release official student reports from one clear workflow." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="module-workspace" style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 56 }}>
        {params.notice ? <div className="inline-result success" role="status" style={{ marginBottom: 14 }}>{params.notice}</div> : null}

        <section className="module-card" style={{ padding: 24, background: "linear-gradient(135deg,rgba(29,78,216,.08),rgba(255,255,255,.98) 60%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 720 }}>
              <div className="module-overline">Official academic reporting</div>
              <h2 style={{ margin: "5px 0 8px", fontSize: 30, letterSpacing: "-.02em" }}>{data.term?.name ?? "No reporting term"}</h2>
              <p style={{ margin: 0, lineHeight: 1.65, fontSize: 14 }}>Finish marks first. Then generate draft reports, review them, approve the final versions and release them to families. Everything on this page reflects the actual report records in the school database.</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link className="button secondary" href="/school/gradebook/studio">Open Gradebook</Link>
              <Link className="button secondary" href="/school/reports">Report archive</Link>
              <Link className="button secondary" href="/school/downloads">Downloads</Link>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, margin: "14px 0" }}>
          {[["Learners", overall.totalLearners, "Active students"], ["Generated", overall.reports, "Report records"], ["Draft", overall.draft, "Need submission"], ["For approval", overall.submitted, "Need approval"], ["Released", overall.sent, "Published to families"]].map(([label, value, hint]) => (
            <article key={String(label)} className="module-card" style={{ padding: 15 }}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: .6 }}>{label}</div><strong style={{ display: "block", fontSize: 26, marginTop: 4 }}>{value}</strong><small style={{ opacity: .66 }}>{hint}</small></article>
          ))}
        </section>

        <section className="module-card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}><div className="module-overline">Working context</div><h3 style={{ margin: "4px 0 3px" }}>Choose what you are reporting</h3><p style={{ margin: 0, fontSize: 12, opacity: .7 }}>Select a term and, when you are ready to work on one class, select the class.</p></div>
            <form action="/school/report-cards" method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", flex: 2, justifyContent: "flex-end" }}>
              <label style={{ display: "grid", gap: 5, minWidth: 190, fontSize: 11, fontWeight: 800 }}>Term<select name="term" defaultValue={data.term?.id ?? ""}>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
              <label style={{ display: "grid", gap: 5, minWidth: 210, fontSize: 11, fontWeight: 800 }}>Class<select name="classId" defaultValue={params.classId ?? ""}><option value="">All classes</option>{data.classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.level ? `${cls.level} · ` : ""}{cls.name}</option>)}</select></label>
              <button className="button primary" type="submit">Open class</button>
            </form>
          </div>
        </section>

        {data.selectedClass ? (
          <>
            <section className="module-card" style={{ padding: 20, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
                <div><div className="module-overline">Class workspace</div><h3 style={{ fontSize: 22, margin: "4px 0 5px" }}>{data.selectedClass.level ? `${data.selectedClass.level} · ` : ""}{data.selectedClass.name}</h3><p style={{ margin: 0, fontSize: 13, opacity: .7 }}>{selected.learners} active learners · {data.selectedClass.name} · {data.term?.name}</p></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, fontWeight: 800, opacity: .6 }}>Current format</div><strong>{activeTemplate?.name ?? "No template selected"}</strong><div style={{ fontSize: 11, marginTop: 3, opacity: .65 }}>{data.settings?.allowPartialReportCards ? "Partial reports allowed" : "Complete scores required"}</div></div>
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
              <article className="module-card" style={{ padding: 18 }}><div className="module-overline">1 · Gradebook readiness</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}><strong style={{ fontSize: 25 }}>{gradebookCompletion}%</strong><span style={{ fontSize: 11, opacity: .65 }}>{data.selectedClassScores}/{expectedScores || 0} scores</span></div><div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", marginTop: 9 }}><div style={{ width: `${gradebookCompletion}%`, height: "100%", background: "currentColor", opacity: .72 }} /></div><p style={{ fontSize: 12, margin: "9px 0 0", lineHeight: 1.5 }}>{!data.selectedClassAssessments ? "No assessments have been created for this class and term." : missingScores ? `${missingScores} score${missingScores === 1 ? " is" : "s are"} still missing.` : "All expected scores are present."}</p></article>
              <article className="module-card" style={{ padding: 18 }}><div className="module-overline">2 · Report coverage</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}><strong style={{ fontSize: 25 }}>{reportCoverage}%</strong><span style={{ fontSize: 11, opacity: .65 }}>{selected.reports}/{selected.learners} reports</span></div><div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", marginTop: 9 }}><div style={{ width: `${reportCoverage}%`, height: "100%", background: "currentColor", opacity: .72 }} /></div><p style={{ fontSize: 12, margin: "9px 0 0", lineHeight: 1.5 }}>{missingReports ? `${missingReports} learner${missingReports === 1 ? " still needs" : "s still need"} a report record.` : "Every learner has a report record."}</p></article>
              <article className="module-card" style={{ padding: 18 }}><div className="module-overline">3 · Release readiness</div><strong style={{ display: "block", fontSize: 18, marginTop: 9 }}>{releaseChannels.length ? `${releaseChannels.join(" + ")} configured` : "Delivery not configured"}</strong><p style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>{releaseChannels.length ? "Approved reports can move into the family-release workflow." : "Approval can still be completed, but release needs a configured delivery channel."}</p></article>
            </section>

            <section className="module-card" style={{ padding: 20, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 13 }}>
                <div><div className="module-overline">Generate</div><h3 style={{ margin: "4px 0" }}>Create this class's report cards</h3><p style={{ margin: 0, fontSize: 12, opacity: .68 }}>Generation creates only missing draft records. Submitted, approved and released reports are left untouched.</p></div>
                <div>{data.canGenerate ? (data.selectedClassAssessments ? <form action={runReportCardAction}><input type="hidden" name="action" value="generate-class"/><input type="hidden" name="classId" value={data.selectedClass.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><button className="button primary" type="submit" disabled={!missingReports || generationBlocked}>{missingReports ? `Generate ${missingReports} missing` : "All reports generated"}</button></form> : <Link className="button secondary" href="/school/exams">Set up assessments</Link>) : null}</div>
              </div>
              {generationBlocked ? <div className="inline-result" style={{ padding: 12 }}><strong>Generation is blocked.</strong> {data.selectedClassAssessments ? `${missingScores} gradebook score${missingScores === 1 ? "" : "s"} are missing. Complete the gradebook before generating official reports.` : "Create at least one assessment for this class and term first."}</div> : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8, marginTop: 13 }}>
                {[["Draft", selected.draft], ["For approval", selected.submitted], ["Approved", selected.approved], ["Released", selected.sent], ["Missing", missingReports]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, border: "1px solid var(--sn-line,#e5e7eb)", borderRadius: 12 }}><div style={{ fontSize: 10, fontWeight: 800, opacity: .6 }}>{label}</div><strong style={{ fontSize: 20 }}>{value}</strong></div>)}
              </div>
            </section>

            <section className="module-card" style={{ padding: 20, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
                <div><div className="module-overline">Review queue</div><h3 style={{ margin: "4px 0" }}>{data.selectedClass.name} · {data.term?.name}</h3><p style={{ margin: 0, fontSize: 12, opacity: .68 }}>Work one learner at a time. The available action always reflects the report's current state.</p></div>
                <form action="/school/report-cards" method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="hidden" name="term" value={data.term?.id ?? ""}/><input type="hidden" name="classId" value={data.selectedClass.id}/><select name="status" defaultValue={params.status ?? ""}><option value="">All states</option><option value="draft">Draft</option><option value="submitted">For approval</option><option value="approved">Approved</option><option value="sent">Released</option></select><button className="button secondary" type="submit">Filter</button></form>
              </div>
              <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Learner</th><th>Status</th><th>Created</th><th>Next action</th></tr></thead><tbody>
                {data.reports.map((report) => {
                  const meta = statusMeta[report.status] ?? { label: report.status, hint: "", next: "Open" };
                  return <tr key={report.id}><td><strong>{report.student.name}</strong><small>{report.student.admissionNo}</small></td><td><span className="app-pill">{meta.label}</span><small>{meta.hint}</small></td><td>{new Date(report.createdAt).toLocaleDateString("en-GH")}</td><td><div className="modal-actions" style={{ flexWrap: "wrap" }}>{report.status === "draft" && data.canSubmit ? <form action={runReportCardAction}><input type="hidden" name="action" value="submit"/><input type="hidden" name="reportCardId" value={report.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><input type="hidden" name="classId" value={data.selectedClass.id}/><button className="app-action" type="submit"><strong>Submit</strong></button></form> : null}{report.status === "submitted" && data.canApprove ? <form action={runReportCardAction}><input type="hidden" name="action" value="approve"/><input type="hidden" name="reportCardId" value={report.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><input type="hidden" name="classId" value={data.selectedClass.id}/><button className="app-action" type="submit"><strong>Approve</strong></button></form> : null}{report.status === "approved" && data.canApprove ? <form action={runReportCardAction}><input type="hidden" name="action" value="send"/><input type="hidden" name="reportCardId" value={report.id}/><input type="hidden" name="termId" value={data.term?.id ?? ""}/><input type="hidden" name="classId" value={data.selectedClass.id}/><button className="app-action" type="submit"><strong>Release</strong></button></form> : null}<Link className="app-action" href={`/school/report-cards/${report.id}/print`}><strong>Preview</strong></Link></div></td></tr>;
                })}
                {!data.reports.length ? <tr><td colSpan={4}><div className="module-empty"><strong>No reports in this view.</strong><span>{missingReports ? "Generate the missing reports above to start the review queue." : "Try another status filter."}</span></div></td></tr> : null}
              </tbody></table></div>
            </section>
          </>
        ) : (
          <section className="module-card" style={{ padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", flexWrap: "wrap", marginBottom: 14 }}><div><div className="module-overline">Class runs</div><h3 style={{ margin: "4px 0" }}>Choose a class to work on</h3><p style={{ margin: 0, fontSize: 12, opacity: .68 }}>This is the school-level view. Pick a class to get its gradebook readiness, generation controls and learner review queue.</p></div><span style={{ fontSize: 12, fontWeight: 800, opacity: .62 }}>{data.term?.name ?? "No term"}</span></div>
            <div style={{ display: "grid", gap: 9 }}>
              {classRows.map((row) => <div key={row.cls.id} style={{ display: "grid", gridTemplateColumns: "minmax(190px,1.4fr) minmax(150px,1fr) auto", gap: 16, alignItems: "center", padding: 15, border: "1px solid var(--sn-line,#e5e7eb)", borderRadius: 14 }}><div><strong style={{ fontSize: 15 }}>{row.cls.level ? `${row.cls.level} · ` : ""}{row.cls.name}</strong><div style={{ fontSize: 11, marginTop: 4, opacity: .66 }}>{row.classLearners} learners · {row.classReports.length} reports · {row.missing} missing</div></div><div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 800, marginBottom: 5 }}><span>Report coverage</span><span>{row.coverage}%</span></div><div style={{ height: 7, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${row.coverage}%`, height: "100%", background: "currentColor", opacity: .72 }} /></div><div style={{ fontSize: 10, marginTop: 5, opacity: .65 }}>{row.draft} draft · {row.submitted} review · {row.approved} approved · {row.sent} released</div></div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span style={{ fontSize: 11, fontWeight: 800, opacity: .66 }}>{row.next}</span><Link className="button secondary" href={`/school/report-cards?term=${encodeURIComponent(data.term?.id ?? "")}&classId=${encodeURIComponent(row.cls.id)}`}>Open class</Link></div></div>)}
              {!classRows.length ? <div className="module-empty"><strong>No classes available.</strong><span>Create academic classes before running report cards.</span></div> : null}
            </div>
          </section>
        )}

        <section className="module-card" style={{ padding: 20 }}>
          <div><div className="module-overline">How reporting works</div><h3 style={{ margin: "4px 0" }}>One record, four clear states</h3><p style={{ margin: 0, fontSize: 12, opacity: .68 }}>The report card is not considered final just because a PDF exists. Its state tells the school exactly what happens next.</p></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
            {[['1','Draft','Generated from the gradebook.'],['2','For approval','Submitted by the class teacher for review.'],['3','Approved','Academic approval is recorded and ranking is frozen.'],['4','Released','The approved report is delivered through the configured family channel.']].map(([number,title,body]) => <div key={number} style={{ border: "1px solid var(--sn-line,#e5e7eb)", borderRadius: 14, padding: 14 }}><div style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", border: "1px solid var(--sn-line,#e5e7eb)", fontWeight: 900, fontSize: 11 }}>{number}</div><strong style={{ display: "block", marginTop: 9 }}>{title}</strong><p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, opacity: .68 }}>{body}</p></div>)}
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}><Link className="button secondary" href="/school/settings">Report-card settings</Link><Link className="button secondary" href="/school/reports">Report archive</Link><Link className="button secondary" href="/school/downloads">Downloads & exports</Link></div>
        </section>
      </div>
    </AppShell>
  );
}
