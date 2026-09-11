import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ReportCardGenerateButton } from "@/components/ReportCardGenerateButton";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { submitReportCard } from "@/lib/report-card-service";
import { approveAndQueuePublicReportCard, sendApprovedReportCardPublic } from "@/lib/report-card-release-service";
import { getReportCardPrintData, reportBelongsToClass } from "@/lib/report-card-print-data";
import { readManualPromotionDecision, setReportPromotionDecision } from "@/lib/report-card-promotion";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import "./report-cards.css";

function origin() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/g, "");
}

async function runReportCardAction(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const action = String(formData.get("action") || "");
  const academicYearId = String(formData.get("academicYearId") || "");
  const termId = String(formData.get("termId") || "");
  const classId = String(formData.get("classId") || "");
  const studentId = String(formData.get("studentId") || "");
  const reportCardId = String(formData.get("reportCardId") || "");
  const headRemark = String(formData.get("headRemark") || "").trim();
  if (!termId || !classId) throw new Error("Choose an academic year, term and class first.");
  if (!reportCardId) throw new Error("A report card is required.");

  let notice = "";
  await withTenant(session.schoolId, async (tx) => {
    const contextTerm = await tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId }, select: { academicYearId: true } });
    if (!contextTerm || (academicYearId && contextTerm.academicYearId !== academicYearId)) throw new Error("The selected term does not belong to the selected academic year.");

    if (action === "promotion") {
      const decision = String(formData.get("decision") || "");
      if (decision !== "promoted" && decision !== "not_promoted") throw new Error("Choose a valid promotion decision.");
      await setReportPromotionDecision(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId, decision });
      notice = decision === "promoted" ? "Promotion decision saved: promote learner." : "Promotion decision saved: learner will not be promoted.";
      return;
    }

    if (action === "submit") {
      const report = await tx.reportCard.findFirst({
        where: { id: reportCardId, schoolId: session.schoolId },
        select: { termId: true, calculationSnapshot: true, term: { select: { academicYearId: true } } },
      });
      const settings = await tx.schoolSettings.findUnique({
        where: { schoolId: session.schoolId },
        select: { reportCardConfig: true, reportCardTemplateId: true },
      });
      if (report && settings) {
        const workflow = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
        const yearTerms = await tx.term.findMany({
          where: { schoolId: session.schoolId, academicYearId: report.term.academicYearId },
          orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
          select: { id: true },
        });
        const isFinal = yearTerms[workflow.finalTermNumber - 1]?.id === report.termId;
        if (isFinal && !readManualPromotionDecision(report.calculationSnapshot)) {
          throw new Error("The class teacher must choose Promote or Do not promote before submitting the final-term report.");
        }
      }
      await submitReportCard(tx, { schoolId: session.schoolId, actorId: session.userId, reportCardId });
      notice = "Report submitted for approval.";
    } else if (action === "approve") {
      await approveAndQueuePublicReportCard(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        reportCardId,
        origin: origin(),
        headRemark: headRemark || undefined,
      });
      notice = "Report approved. Results, class identity, theme and signatures are now frozen.";
    } else if (action === "release") {
      await sendApprovedReportCardPublic(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        reportCardId,
        origin: origin(),
      });
      notice = "Report released to the learner's family.";
    } else {
      throw new Error("Unsupported report-card action.");
    }
  });

  revalidatePath("/school/report-cards");
  redirect(`/school/report-cards?${academicYearId ? `year=${encodeURIComponent(academicYearId)}&` : ""}term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ""}${notice ? `&notice=${encodeURIComponent(notice)}` : ""}`);
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "For approval",
  approved: "Approved",
  sent: "Released",
};

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; term?: string; classId?: string; studentId?: string; notice?: string }>;
}) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, academicYears, allTerms, classes, canGenerate, canSubmit, canApprove, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.academicYear.findMany({
        where: { schoolId: session.schoolId },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true, isLocked: true },
      }),
      tx.term.findMany({
        where: { schoolId: session.schoolId },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true, academicYearId: true, isLocked: true },
      }),
      tx.class.findMany({
        where: { schoolId: session.schoolId },
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true, classTeacherId: true, _count: { select: { students: true } } },
      }),
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
      tx.schoolSettings.findUnique({
        where: { schoolId: session.schoolId },
        select: { reportCardConfig: true, reportCardTemplateId: true },
      }),
    ]);

    const now = new Date();
    const requestedTerm = params.term ? allTerms.find((item) => item.id === params.term) ?? null : null;
    const selectedYear = (params.year ? academicYears.find((item) => item.id === params.year) : null)
      ?? (requestedTerm ? academicYears.find((item) => item.id === requestedTerm.academicYearId) : null)
      ?? academicYears.find((item) => item.startDate <= now && item.endDate >= now)
      ?? academicYears[0]
      ?? null;
    const terms = selectedYear ? allTerms.filter((item) => item.academicYearId === selectedYear.id) : [];
    const term = (requestedTerm && requestedTerm.academicYearId === selectedYear?.id ? requestedTerm : null) ?? terms[0] ?? null;
    const selectedClass = params.classId ? classes.find((item) => item.id === params.classId) ?? null : classes[0] ?? null;
    const permissions = { canGenerate, canSubmit, canApprove };
    if (!selectedYear || !term || !selectedClass) {
      return {
        school,
        academicYears,
        selectedYear,
        terms,
        classes,
        term,
        selectedClass,
        students: [],
        currentStudents: [],
        reports: [],
        selectedReport: null,
        detail: null,
        permissions,
        isFinalTerm: false,
        isClassTeacher: false,
      };
    }

    const [currentStudents, allReports, yearTerms] = await Promise.all([
      tx.student.findMany({
        where: { schoolId: session.schoolId, classId: selectedClass.id, status: "active" },
        select: { id: true, name: true, admissionNo: true },
        orderBy: { name: "asc" },
      }),
      tx.reportCard.findMany({
        where: { schoolId: session.schoolId, termId: term.id },
        select: {
          id: true,
          studentId: true,
          status: true,
          createdAt: true,
          calculationSnapshot: true,
          student: { select: { id: true, name: true, admissionNo: true, classId: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      tx.term.findMany({
        where: { schoolId: session.schoolId, academicYearId: selectedYear.id },
        orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
        select: { id: true },
      }),
    ]);

    const reports = allReports.filter((report) =>
      reportBelongsToClass(report.calculationSnapshot, report.student.classId, selectedClass.id),
    );
    const studentMap = new Map(currentStudents.map((student) => [student.id, student]));
    for (const report of reports) {
      if (!studentMap.has(report.studentId)) {
        studentMap.set(report.studentId, {
          id: report.student.id,
          name: report.student.name,
          admissionNo: report.student.admissionNo,
        });
      }
    }
    const students = [...studentMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const selectedStudentId = params.studentId && students.some((student) => student.id === params.studentId)
      ? params.studentId
      : reports[0]?.studentId ?? students[0]?.id ?? "";
    const selectedReport = reports.find((candidate) => candidate.studentId === selectedStudentId) ?? null;
    const detail = selectedReport
      ? await getReportCardPrintData(tx, { schoolId: session.schoolId, reportId: selectedReport.id })
      : null;
    const workflow = readReportWorkflowConfig(settings?.reportCardConfig, settings?.reportCardTemplateId);
    const isFinalTerm = yearTerms[workflow.finalTermNumber - 1]?.id === term.id;
    return {
      school,
      academicYears,
      selectedYear,
      terms,
      classes,
      term,
      selectedClass,
      students,
      currentStudents,
      reports,
      selectedReport,
      detail,
      permissions,
      isFinalTerm,
      isClassTeacher: selectedClass.classTeacherId === session.userId,
    };
  });

  if (!data.school) return null;
  if (!data.selectedYear || !data.term || !data.selectedClass) {
    return (
      <AppShell universe="school" title="Report Cards" subtitle="Create and print student reports." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
        <main className="simple-reports">
          <section className="reports-empty">
            <h1>Set up an academic year and reporting term first</h1>
            <p>Report cards are always attached to a specific academic year and term. Create those periods in Academic Setup, then return here.</p>
            <Link className="report-action primary" href="/school/academics/setup">Open Academic Setup</Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const selectedYear = data.selectedYear;
  const term = data.term;
  const selectedClass = data.selectedClass;
  const detail = data.detail;
  const report = data.selectedReport;
  const currentReportIds = new Set(data.reports.map((item) => item.studentId));
  const missing = data.currentStudents.filter((student) => !currentReportIds.has(student.id)).length;
  const hiddenContext = (studentId = detail?.student.id ?? "") => (
    <>
      <input type="hidden" name="academicYearId" value={selectedYear.id} />
      <input type="hidden" name="termId" value={term.id} />
      <input type="hidden" name="classId" value={selectedClass.id} />
      <input type="hidden" name="studentId" value={studentId} />
    </>
  );
  const contextHref = `year=${encodeURIComponent(selectedYear.id)}&term=${encodeURIComponent(term.id)}&classId=${encodeURIComponent(selectedClass.id)}`;

  return (
    <AppShell universe="school" title="Report Cards" subtitle="Academic year → term → class → official learner report." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main className="simple-reports">
        {params.notice ? <div className="report-notice" role="status">{params.notice}</div> : null}

        <section className="reports-header">
          <div>
            <span className="reports-kicker">REPORT CARDS</span>
            <h1>{data.school.name}</h1>
            <p>{selectedYear.name} · {term.name} · {selectedClass.level ? `${selectedClass.level} · ` : ""}{selectedClass.name}{data.isFinalTerm ? " · Final term" : ""}</p>
          </div>
          <div className="result-print-actions">
            <Link className="report-action" href="/school/settings/reporting/intelligence">Report settings</Link>
            {data.reports.length ? (
              <a className="report-action primary" href={`/school/report-cards/class-print?term=${encodeURIComponent(term.id)}&classId=${encodeURIComponent(selectedClass.id)}`}>Print class ({data.reports.length})</a>
            ) : null}
            {data.permissions.canGenerate ? <ReportCardGenerateButton termId={term.id} classId={selectedClass.id} missing={missing} /> : null}
          </div>
        </section>

        <section className="reports-picker">
          <form method="get">
            <div>
              <label>Academic year<select name="year" defaultValue={selectedYear.id}>{data.academicYears.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isLocked ? " · Locked" : ""}</option>)}</select></label>
              <label>Term<select name="term" defaultValue={term.id}>{data.terms.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isLocked ? " · Locked" : ""}</option>)}</select></label>
              <label>Class<select name="classId" defaultValue={selectedClass.id}>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
              <label>Student<select name="studentId" defaultValue={detail?.student.id ?? ""}><option value="">Choose student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}</option>)}</select></label>
            </div>
            <button className="report-action primary" type="submit">Open reporting context</button>
          </form>
          <p className="reports-context-note">Changing the academic year narrows the term list on the next load. Historical years remain available without mixing their results into the current year.</p>
        </section>

        {!data.students.length ? (
          <section className="reports-empty">
            <h2>No learners or historical reports in this class</h2>
            <p>Add learners to the selected class or choose a different academic year, term or class.</p>
          </section>
        ) : null}

        <section className="reports-list-card">
          <div className="reports-list-heading">
            <div><span className="reports-kicker">CLASS REPORTS</span><h2>Student reports</h2></div>
            <span>{data.reports.length} generated</span>
          </div>
          <div className="reports-list">
            {data.students.map((student) => {
              const item = data.reports.find((candidate) => candidate.studentId === student.id);
              const active = student.id === detail?.student.id;
              return (
                <div className={`report-row ${active ? "active" : ""}`} key={student.id}>
                  <div><strong>{student.name}</strong><span>{student.admissionNo}</span></div>
                  <div className="report-row-status">
                    {item ? <span className={`status ${item.status}`}>{statusLabel[item.status] ?? item.status}</span> : <span className="status missing">Not generated</span>}
                    {item ? <Link className="report-action small" href={`/school/report-cards?${contextHref}&studentId=${encodeURIComponent(student.id)}`}>Open</Link> : null}
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
              <div className="result-print-actions">
                <span className={`status ${report.status}`}>{statusLabel[report.status] ?? report.status}</span>
                <a className="report-action" href={`/api/mvp/report-cards/${encodeURIComponent(report.id)}/pdf?download=1`}>Download PDF</a>
                <a className="report-action primary" href={`/school/report-cards/${encodeURIComponent(report.id)}/print`}>Print report card</a>
              </div>
            </div>

            <div className="result-summary">
              <div><span>Average</span><strong>{detail.summary.average ?? "—"}</strong></div>
              <div><span>Overall grade</span><strong>{detail.summary.grade ?? "—"}</strong></div>
              <div><span>Position</span><strong>{detail.position ?? "—"}{detail.position && detail.classSize ? ` / ${detail.classSize}` : ""}</strong></div>
              <div><span>Attendance</span><strong>{detail.attendance.present}{detail.attendance.totalRecorded ? ` / ${detail.attendance.totalRecorded}` : ""}</strong></div>
            </div>

            <div className="result-table-wrap">
              <table>
                <thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Position</th></tr></thead>
                <tbody>{detail.results.map((row) => <tr key={row.subjectId}><td>{row.subject}</td><td>{row.ca ?? "—"}</td><td>{row.exam ?? "—"}</td><td>{row.total ?? "—"}</td><td>{row.grade ?? "—"}</td><td>{row.position ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>

            {data.isFinalTerm && data.isClassTeacher && report.status === "draft" ? (
              <div className="promotion-panel">
                <div><strong>Final-term promotion decision</strong><span>Only the assigned class teacher can decide this learner&apos;s progression.</span></div>
                <div className="result-flow">
                  <form action={runReportCardAction}>
                    <input type="hidden" name="action" value="promotion" />
                    <input type="hidden" name="decision" value="promoted" />
                    {hiddenContext(detail.student.id)}
                    <input type="hidden" name="reportCardId" value={report.id} />
                    <button className={`report-action ${detail.manualPromotionDecision === "promoted" ? "primary" : ""}`} type="submit">Promote</button>
                  </form>
                  <form action={runReportCardAction}>
                    <input type="hidden" name="action" value="promotion" />
                    <input type="hidden" name="decision" value="not_promoted" />
                    {hiddenContext(detail.student.id)}
                    <input type="hidden" name="reportCardId" value={report.id} />
                    <button className={`report-action ${detail.manualPromotionDecision === "not_promoted" ? "primary" : ""}`} type="submit">Do not promote</button>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="result-footer">
              <div>
                {detail.remarks ? <><strong>Class teacher remark</strong><p>{detail.remarks}</p></> : <span>No class-teacher remark recorded.</span>}
                {detail.headRemark ? <><strong>Headteacher remark</strong><p>{detail.headRemark}</p></> : null}
                {data.isClassTeacher && report.status === "draft" ? <Link className="report-action small" href={`/school/report-cards/${encodeURIComponent(report.id)}/remarks`}>Write / edit class teacher remark</Link> : null}
              </div>
              <div className="result-flow">
                {data.permissions.canSubmit && data.isClassTeacher && report.status === "draft" ? (
                  <form action={runReportCardAction}>
                    <input type="hidden" name="action" value="submit" />
                    {hiddenContext(detail.student.id)}
                    <input type="hidden" name="reportCardId" value={report.id} />
                    <button className="report-action" type="submit">Submit for approval</button>
                  </form>
                ) : null}
                {data.permissions.canApprove && report.status === "submitted" ? (
                  <form action={runReportCardAction} className="approval-form">
                    <input type="hidden" name="action" value="approve" />
                    {hiddenContext(detail.student.id)}
                    <input type="hidden" name="reportCardId" value={report.id} />
                    <input name="headRemark" maxLength={2000} placeholder="Headteacher remark (optional)" />
                    <button className="report-action" type="submit">Approve & freeze</button>
                  </form>
                ) : null}
                {data.permissions.canApprove && report.status === "approved" ? (
                  <form action={runReportCardAction}>
                    <input type="hidden" name="action" value="release" />
                    {hiddenContext(detail.student.id)}
                    <input type="hidden" name="reportCardId" value={report.id} />
                    <button className="report-action" type="submit">Release to family</button>
                  </form>
                ) : null}
              </div>
            </div>
          </section>
        ) : data.students.length ? (
          <section className="reports-empty">
            <h2>No report card for this student yet</h2>
            <p>Generate the class reports above, then open the learner.</p>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
