import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { generateReportCard, submitReportCard } from "@/lib/report-card-service";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";
import { calculateIntelligentReportCard } from "@/lib/report-card-intelligence";

function origin() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/g, "");
}

async function runReportCardAction(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const action = String(formData.get("action") || "");
  const termId = String(formData.get("termId") || "");
  const classId = String(formData.get("classId") || "");
  const studentId = String(formData.get("studentId") || "");
  const reportCardId = String(formData.get("reportCardId") || "");
  if (!termId || !classId) throw new Error("Choose a term and class first.");

  await withTenant(session.schoolId, async (tx) => {
    if (action === "generate") {
      await requirePermission(tx, session.userId, "reports:generate");
      const students = await tx.student.findMany({
        where: { schoolId: session.schoolId, classId, status: "active" },
        select: { id: true, admissionNo: true },
        orderBy: { name: "asc" },
      });
      const existing = await tx.reportCard.findMany({
        where: { schoolId: session.schoolId, termId, student: { classId } },
        select: { studentId: true },
      });
      const existingIds = new Set(existing.map((row) => row.studentId));
      let created = 0;
      const skipped: string[] = [];
      for (const student of students) {
        if (existingIds.has(student.id)) continue;
        try {
          await generateReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, studentId: student.id, termId });
          created += 1;
        } catch (error) {
          skipped.push(`${student.admissionNo}: ${error instanceof Error ? error.message.slice(0, 120) : "not ready"}`);
        }
      }
      const note = skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "; …" : ""}` : "";
      const message = created ? `Generated ${created} report${created === 1 ? "" : "s"}.${note}` : `No new reports were generated.${note}`;
      revalidatePath("/school/report-cards");
      redirect(`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ""}&notice=${encodeURIComponent(message)}`);
    }

    if (!reportCardId) throw new Error("A report card is required.");
    if (action === "submit") await submitReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId });
    else if (action === "approve") await approveAndQueuePublicReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: origin() });
    else if (action === "release") await sendApprovedReportCardPublic(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, origin: origin() });
    else throw new Error("Unsupported report-card action.");
  });

  revalidatePath("/school/report-cards");
  redirect(`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ""}`);
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "For approval",
  approved: "Approved",
  sent: "Released",
};

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; studentId?: string; notice?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, classes, canGenerate, canSubmit, canApprove] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 12, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
    ]);
    const term = terms.find((item) => item.id === params.term) ?? terms[0] ?? null;
    const selectedClass = params.classId ? classes.find((item) => item.id === params.classId) ?? null : classes[0] ?? null;
    const permissions = { canGenerate, canSubmit, canApprove };
    if (!term || !selectedClass) return { school, terms, classes, term, selectedClass, students: [], reports: [], selectedReport: null, detail: null, permissions };

    const students = await tx.student.findMany({
      where: { schoolId: session.schoolId, classId: selectedClass.id, status: "active" },
      select: { id: true, name: true, admissionNo: true },
      orderBy: { name: "asc" },
    });
    const reports = await tx.reportCard.findMany({
      where: { schoolId: session.schoolId, termId: term.id, student: { classId: selectedClass.id } },
      select: { id: true, studentId: true, status: true, createdAt: true, student: { select: { name: true, admissionNo: true } } },
      orderBy: { createdAt: "desc" },
    });
    const selectedStudentId = params.studentId && students.some((student) => student.id === params.studentId) ? params.studentId : (students[0]?.id ?? "");
    const selectedReport = reports.find((candidate) => candidate.studentId === selectedStudentId) ?? null;
    const detail = selectedReport ? await calculateIntelligentReportCard(tx, { schoolId: session.schoolId, reportId: selectedReport.id }) : null;
    return { school, terms, classes, term, selectedClass, students, reports, selectedReport, detail, permissions };
  });

  if (!data.school) return null;
  if (!data.term || !data.selectedClass) {
    return (
      <AppShell universe="school" title="Report Cards" subtitle="Create and print student reports." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
        <main className="simple-reports"><section className="reports-empty"><h1>Set up a reporting term first</h1><p>Once a term and class exist, this page lets you open a report and print it directly.</p></section></main>
      </AppShell>
    );
  }

  const term = data.term;
  const selectedClass = data.selectedClass;
  const detail = data.detail;
  const report = data.selectedReport;
  const missing = Math.max(0, data.students.length - data.reports.length);

  const hiddenContext = (studentId = detail?.student.id ?? "") => (
    <>
      <input type="hidden" name="termId" value={term.id} />
      <input type="hidden" name="classId" value={selectedClass.id} />
      <input type="hidden" name="studentId" value={studentId} />
    </>
  );

  return (
    <AppShell universe="school" title="Report Cards" subtitle="Choose a student, view the result, and print." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main className="simple-reports">
        {params.notice ? <div className="report-notice" role="status">{params.notice}</div> : null}

        <section className="reports-header">
          <div><span className="reports-kicker">REPORT CARDS</span><h1>{data.school.name}</h1><p>{term.name} · {selectedClass.level ? `${selectedClass.level} · ` : ""}{selectedClass.name}</p></div>
          {data.permissions.canGenerate ? (
            <form action={runReportCardAction}>
              <input type="hidden" name="action" value="generate" />
              {hiddenContext()}
              <button className="report-action primary" type="submit">{missing ? `Generate ${missing} missing` : "Reports generated"}</button>
            </form>
          ) : null}
        </section>

        <section className="reports-picker">
          <form method="get">
            <div>
              <label>Term<select name="term" defaultValue={term.id}>{data.terms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Class<select name="classId" defaultValue={selectedClass.id}>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Student<select name="studentId" defaultValue={detail?.student.id ?? ""}><option value="">Choose student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}</option>)}</select></label>
            </div>
            <button className="report-action primary" type="submit">Open report</button>
          </form>
        </section>

        {!data.students.length ? <section className="reports-empty"><h2>No active students in this class</h2><p>Add or enrol a student in the selected class before generating report cards.</p></section> : null}

        <section className="reports-list-card">
          <div className="reports-list-heading"><div><span className="reports-kicker">CLASS REPORTS</span><h2>Student reports</h2></div><span>{data.reports.length}/{data.students.length} generated</span></div>
          <div className="reports-list">
            {data.students.map((student) => {
              const item = data.reports.find((candidate) => candidate.studentId === student.id);
              const active = student.id === detail?.student.id;
              return (
                <div className={`report-row ${active ? "active" : ""}`} key={student.id}>
                  <div><strong>{student.name}</strong><span>{student.admissionNo}</span></div>
                  <div className="report-row-status">
                    {item ? <span className={`status ${item.status}`}>{statusLabel[item.status] ?? item.status}</span> : <span className="status missing">Not generated</span>}
                    {item ? <Link className="report-action small" href={`/school/report-cards?term=${encodeURIComponent(term.id)}&classId=${encodeURIComponent(selectedClass.id)}&studentId=${encodeURIComponent(student.id)}`}>Open</Link> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {detail && report ? (
          <section className="report-result-card">
            <div className="result-heading">
              <div><span className="reports-kicker">REPORT RESULT</span><h2>{detail.student.name}</h2><p>{detail.student.className} · {detail.student.admissionNo} · {detail.term.academicYear} · {detail.term.name}</p></div>
              <div className="result-print-actions"><span className={`status ${report.status}`}>{statusLabel[report.status] ?? report.status}</span><a className="report-action primary" href={`/school/report-cards/${encodeURIComponent(report.id)}/print`}>Print report card</a></div>
            </div>
            <div className="result-summary">
              <div><span>Average</span><strong>{detail.summary.average ?? "—"}</strong></div>
              <div><span>Overall grade</span><strong>{detail.summary.grade ?? "—"}</strong></div>
              <div><span>Position</span><strong>{detail.position ?? "—"}{detail.position && detail.classSize ? ` / ${detail.classSize}` : ""}</strong></div>
              <div><span>Attendance</span><strong>{detail.attendance.present}{detail.attendance.totalRecorded ? ` / ${detail.attendance.totalRecorded}` : ""}</strong></div>
            </div>
            <div className="result-table-wrap"><table><thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Position</th></tr></thead><tbody>{detail.results.map((row) => <tr key={row.subjectId}><td>{row.subject}</td><td>{row.ca ?? "—"}</td><td>{row.exam ?? "—"}</td><td>{row.total ?? "—"}</td><td>{row.grade ?? "—"}</td><td>{row.position ?? "—"}</td></tr>)}</tbody></table></div>
            <div className="result-footer">
              <div>{detail.remarks ? <><strong>Teacher remarks</strong><p>{detail.remarks}</p></> : <span>No teacher remark recorded.</span>}{detail.headRemark ? <><strong>Headteacher remark</strong><p>{detail.headRemark}</p></> : null}</div>
              <div className="result-flow">
                {data.permissions.canSubmit && report.status === "draft" ? <form action={runReportCardAction}><input type="hidden" name="action" value="submit" />{hiddenContext(detail.student.id)}<input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Submit for approval</button></form> : null}
                {data.permissions.canApprove && report.status === "submitted" ? <form action={runReportCardAction}><input type="hidden" name="action" value="approve" />{hiddenContext(detail.student.id)}<input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Approve</button></form> : null}
                {data.permissions.canApprove && report.status === "approved" ? <form action={runReportCardAction}><input type="hidden" name="action" value="release" />{hiddenContext(detail.student.id)}<input type="hidden" name="reportCardId" value={report.id} /><button className="report-action" type="submit">Release to family</button></form> : null}
              </div>
            </div>
          </section>
        ) : data.students.length ? <section className="reports-empty"><h2>No report card for this student yet</h2><p>Generate the class reports above, then return here and use <b>Print report card</b>.</p></section> : null}
      </main>
      <style jsx>{`
        .simple-reports{max-width:1400px;margin:0 auto;padding:8px 0 40px;color:var(--sn-ink)}
        .reports-header{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:20px 0}
        .reports-header h1{font-size:30px;margin:4px 0}.reports-header p{margin:0;color:var(--sn-muted)}
        .reports-kicker{font-size:11px;letter-spacing:.14em;font-weight:800;color:var(--sn-muted)}
        .reports-picker,.reports-list-card,.report-result-card,.reports-empty{border:1px solid var(--sn-line);background:var(--sn-surface);border-radius:16px;padding:18px;margin-top:14px}
        .reports-picker form{display:flex;justify-content:space-between;gap:14px;align-items:end}.reports-picker form>div{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;flex:1}
        .reports-picker label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700}.reports-picker select{min-height:42px;border:1px solid var(--sn-line);border-radius:10px;background:var(--sn-canvas);color:inherit;padding:0 10px}
        .report-action{border:1px solid var(--sn-line);background:var(--sn-canvas);color:inherit;border-radius:10px;padding:9px 13px;font-weight:750;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}.report-action.primary{background:var(--sn-ink);color:var(--sn-surface);border-color:var(--sn-ink)}.report-action.small{padding:6px 9px;font-size:12px}
        .reports-list-heading,.result-heading,.result-print-actions,.result-footer,.result-flow{display:flex;align-items:center;justify-content:space-between;gap:12px}.reports-list-heading h2,.result-heading h2{margin:4px 0 0;font-size:20px}
        .reports-list{margin-top:14px}.report-row{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:12px 0;border-top:1px solid var(--sn-line)}.report-row.active{background:var(--sn-canvas);padding:12px;border-radius:10px}.report-row>div:first-child{display:flex;flex-direction:column;gap:3px}.report-row span{color:var(--sn-muted);font-size:12px}.report-row-status{display:flex;align-items:center;gap:10px}
        .status{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--sn-canvas);border:1px solid var(--sn-line);font-size:11px;font-weight:800}.status.sent,.status.approved{background:var(--color-success-soft)}.status.submitted{background:var(--color-info-soft)}.status.missing{background:transparent;color:var(--sn-muted)}
        .result-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.result-summary>div{border:1px solid var(--sn-line);border-radius:12px;padding:12px;background:var(--sn-canvas)}.result-summary span,.result-summary strong{display:block}.result-summary span{font-size:11px;color:var(--sn-muted)}.result-summary strong{font-size:20px;margin-top:5px}
        .result-table-wrap{overflow:auto}.result-table-wrap table{width:100%;border-collapse:collapse;min-width:650px}.result-table-wrap th,.result-table-wrap td{padding:10px;border-bottom:1px solid var(--sn-line);text-align:left}.result-table-wrap th{font-size:11px;color:var(--sn-muted);text-transform:uppercase;letter-spacing:.04em}
        .result-footer{border-top:1px solid var(--sn-line);margin-top:16px;padding-top:16px;align-items:flex-start}.result-footer p{margin:5px 0 12px;max-width:750px}.reports-empty h1,.reports-empty h2{margin-top:0}.report-notice{margin:12px 0;padding:11px 13px;border:1px solid var(--sn-line);border-radius:10px;background:var(--sn-canvas)}
        @media(max-width:900px){.reports-picker form,.reports-header,.result-heading,.result-footer{flex-direction:column;align-items:stretch}.reports-picker form>div{grid-template-columns:1fr}.result-summary{grid-template-columns:repeat(2,1fr)}}
        @media print{.simple-reports{display:none}}
      `}</style>
    </AppShell>
  );
}
