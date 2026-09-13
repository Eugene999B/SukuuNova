import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ReportCardWorkflowBatch } from "@/components/ReportCardWorkflowBatch";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { readManualPromotionDecision } from "@/lib/report-card-promotion";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveStudentTermClass, resolveTermRoster } from "@/lib/student-term-context";
import { selectAcademicTerm } from "@/lib/term-date";
import styles from "@/components/ReportCardOperationsDesk.module.css";

const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "For approval",
  approved: "Approved",
  sent: "Released",
};

export default async function ReportCardOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; classId?: string }>;
}) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const now = new Date();

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, classes, canSubmit, canApprove, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({
        where: { schoolId: session.schoolId },
        orderBy: { startDate: "desc" },
        take: 18,
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          academicYearId: true,
          isLocked: true,
          academicYear: { select: { name: true } },
        },
      }),
      tx.class.findMany({
        where: { schoolId: session.schoolId },
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true, classTeacherId: true },
      }),
      hasPermission(tx, session.userId, "report_cards:submit"),
      hasPermission(tx, session.userId, "report_cards:approve"),
      tx.schoolSettings.findUnique({
        where: { schoolId: session.schoolId },
        select: { reportCardConfig: true, reportCardTemplateId: true, timezone: true },
      }),
    ]);

    const requestedTerm = params.term ? terms.find((term) => term.id === params.term) ?? null : null;
    const selectedTerm = requestedTerm ?? selectAcademicTerm(terms, undefined, now, settings?.timezone ?? "Africa/Accra") ?? terms[0] ?? null;
    const selectedClass = params.classId ? classes.find((schoolClass) => schoolClass.id === params.classId) ?? null : classes[0] ?? null;
    if (!selectedTerm || !selectedClass) {
      return {
        school,
        terms,
        classes,
        selectedTerm,
        selectedClass,
        canSubmit,
        canApprove,
        isClassTeacher: false,
        isFinalTerm: false,
        rows: [] as Array<{ id: string; name: string; admissionNo: string; reportId: string | null; status: string | null }>,
        counts: { missing: 0, draft: 0, submitted: 0, approved: 0, sent: 0 },
        promotionMissing: 0,
        selfApprovalBlocked: 0,
      };
    }

    const [roster, reports, academicYearTerms] = await Promise.all([
      resolveTermRoster(tx, { schoolId: session.schoolId, termId: selectedTerm.id }),
      tx.reportCard.findMany({
        where: { schoolId: session.schoolId, termId: selectedTerm.id },
        select: {
          id: true,
          studentId: true,
          status: true,
          submittedBy: true,
          calculationSnapshot: true,
          student: { select: { id: true, name: true, admissionNo: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.term.findMany({
        where: { schoolId: session.schoolId, academicYearId: selectedTerm.academicYearId },
        orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
        select: { id: true },
      }),
    ]);

    const classReports: typeof reports = [];
    for (const report of reports) {
      const context = await resolveStudentTermClass(tx, {
        schoolId: session.schoolId,
        studentId: report.studentId,
        termId: selectedTerm.id,
      });
      if (context.classId === selectedClass.id) classReports.push(report);
    }

    const termStudents = roster
      .filter((student) => student.termClassId === selectedClass.id)
      .map((student) => ({ id: student.id, name: student.name, admissionNo: student.admissionNo }));
    const reportByStudent = new Map(classReports.map((report) => [report.studentId, report]));
    const studentMap = new Map(termStudents.map((student) => [student.id, student]));
    for (const report of classReports) {
      if (!studentMap.has(report.studentId)) studentMap.set(report.studentId, report.student);
    }
    const students = [...studentMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const rows = students.map((student) => {
      const report = reportByStudent.get(student.id);
      return {
        id: student.id,
        name: student.name,
        admissionNo: student.admissionNo,
        reportId: report?.id ?? null,
        status: report?.status ?? null,
      };
    });

    const workflow = readReportWorkflowConfig(settings?.reportCardConfig, settings?.reportCardTemplateId);
    const isFinalTerm = academicYearTerms[workflow.finalTermNumber - 1]?.id === selectedTerm.id;
    const counts = {
      missing: termStudents.filter((student) => !reportByStudent.has(student.id)).length,
      draft: classReports.filter((report) => report.status === "draft").length,
      submitted: classReports.filter((report) => report.status === "submitted").length,
      approved: classReports.filter((report) => report.status === "approved").length,
      sent: classReports.filter((report) => report.status === "sent").length,
    };
    const promotionMissing = isFinalTerm
      ? classReports.filter((report) => report.status === "draft" && !readManualPromotionDecision(report.calculationSnapshot)).length
      : 0;
    const selfApprovalBlocked = classReports.filter((report) => report.status === "submitted" && report.submittedBy === session.userId).length;

    return {
      school,
      terms,
      classes,
      selectedTerm,
      selectedClass,
      canSubmit,
      canApprove,
      isClassTeacher: selectedClass.classTeacherId === session.userId,
      isFinalTerm,
      rows,
      counts,
      promotionMissing,
      selfApprovalBlocked,
    };
  });

  if (!data.school) return null;

  return (
    <AppShell
      universe="school"
      title="Report Card Operations"
      subtitle="Class-level generation, submission, approval and family release control."
      active="Report Cards"
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      userName={session.name}
    >
      <main className={styles.workspace}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>REPORT CARD OPERATIONS · WAVE 5</span>
            <h1>Move a whole class through reporting without losing control.</h1>
            <p>Review the class pipeline, isolate learners who need attention, then advance only eligible reports through the existing audited workflow.</p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/school/academics/term-completion">Term Completion</Link>
            {data.selectedTerm && data.selectedClass ? <Link href={`/school/report-cards?term=${encodeURIComponent(data.selectedTerm.id)}&classId=${encodeURIComponent(data.selectedClass.id)}`}>Detailed Report Cards</Link> : null}
          </div>
        </section>

        {data.selectedTerm && data.selectedClass ? (
          <>
            <section className={styles.picker}>
              <form method="get">
                <label>Term
                  <select name="term" defaultValue={data.selectedTerm.id}>
                    {data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear.name} · {term.name}{term.isLocked ? " · Locked" : ""}</option>)}
                  </select>
                </label>
                <label>Class
                  <select name="classId" defaultValue={data.selectedClass.id}>
                    {data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}
                  </select>
                </label>
                <button type="submit">Open class</button>
              </form>
            </section>

            <section className={styles.summaryCard}>
              <div className={styles.summaryHead}>
                <div>
                  <span className={styles.eyebrow}>CURRENT CONTEXT</span>
                  <h2>{data.selectedClass.name} · {data.selectedTerm.name}</h2>
                  <p>{data.selectedTerm.academicYear.name}{data.isFinalTerm ? " · Configured final term" : ""}</p>
                </div>
                <div className={styles.summaryMeta}>
                  <span>{data.isClassTeacher ? "You are the class teacher" : "Leadership / reporting view"}</span>
                  {data.selectedTerm.isLocked ? <span>Locked term</span> : <span>Open term</span>}
                </div>
              </div>
              <div className={styles.metrics}>
                <div><span>Not generated</span><strong>{data.counts.missing}</strong><small>Need generation or data correction.</small></div>
                <div><span>Draft</span><strong>{data.counts.draft}</strong><small>Teacher-owned review stage.</small></div>
                <div><span>For approval</span><strong>{data.counts.submitted}</strong><small>Leadership action queue.</small></div>
                <div><span>Approved</span><strong>{data.counts.approved}</strong><small>Frozen, awaiting release.</small></div>
                <div><span>Released</span><strong>{data.counts.sent}</strong><small>Family delivery queued.</small></div>
              </div>
            </section>

            <ReportCardWorkflowBatch
              termId={data.selectedTerm.id}
              classId={data.selectedClass.id}
              counts={data.counts}
              canSubmit={data.canSubmit}
              canApprove={data.canApprove}
              isClassTeacher={data.isClassTeacher}
              finalTerm={data.isFinalTerm}
              promotionMissing={data.promotionMissing}
              selfApprovalBlocked={data.selfApprovalBlocked}
            />

            <section className={styles.learnerCard}>
              <div>
                <span className={styles.eyebrow}>LEARNER EXCEPTIONS</span>
                <h2>Open any learner for remarks, promotion decisions or print review.</h2>
                <p>Batch actions never bypass learner-level rules. Use the detailed report when a learner is blocked or needs an individual remark.</p>
              </div>
              <div className={styles.learnerList}>
                {data.rows.map((row) => (
                  <div className={styles.learnerRow} key={row.id}>
                    <div><strong>{row.name}</strong><small>{row.admissionNo}</small></div>
                    <span className={styles.statusPill}>{row.status ? statusLabel[row.status] ?? row.status : "Not generated"}</span>
                    <Link className={styles.openLink} href={`/school/report-cards?term=${encodeURIComponent(data.selectedTerm!.id)}&classId=${encodeURIComponent(data.selectedClass!.id)}&studentId=${encodeURIComponent(row.id)}`}>Open learner</Link>
                  </div>
                ))}
                {!data.rows.length ? <p className={styles.note}>No learners or historical reports are attached to this class for the selected term.</p> : null}
              </div>
            </section>
          </>
        ) : (
          <section className={styles.empty}>
            <h2>Create an academic term and class first.</h2>
            <p>Report-card operations require a valid reporting term and class context.</p>
            <Link className={styles.openLink} href="/school/academics/setup">Open Academic Setup</Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
