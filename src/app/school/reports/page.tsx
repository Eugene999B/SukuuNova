import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { resolveStudentTermClass } from "@/lib/student-term-context";
import { selectAcademicTerm } from "@/lib/term-date";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; status?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, settings, terms, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, take: 12, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
    ]);
    const term = selectAcademicTerm(terms, params.term, new Date(), settings?.timezone ?? "Africa/Accra");
    if (!term) return { school, terms, term, classes, reports: [] as Array<{ id: string; status: string; createdAt: Date; termClassId: string; termClassName: string; termClassLevel: string | null; student: { id: string; name: string; admissionNo: string } }> };

    const rawReports = await tx.reportCard.findMany({
      where: { schoolId: session.schoolId, termId: term.id, ...(params.status ? { status: params.status } : {}) },
      select: { id: true, status: true, createdAt: true, student: { select: { id: true, name: true, admissionNo: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const classById = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass]));
    const reports = [] as Array<{ id: string; status: string; createdAt: Date; termClassId: string; termClassName: string; termClassLevel: string | null; student: { id: string; name: string; admissionNo: string } }>;
    for (const report of rawReports) {
      const context = await resolveStudentTermClass(tx, { schoolId: session.schoolId, studentId: report.student.id, termId: term.id });
      if (params.classId && context.classId !== params.classId) continue;
      const schoolClass = classById.get(context.classId);
      reports.push({ ...report, termClassId: context.classId, termClassName: schoolClass?.name ?? "Historical class", termClassLevel: schoolClass?.level ?? null });
    }
    return { school, terms, term, classes, reports };
  });

  if (!data.school) return null;
  const counts = {
    draft: data.reports.filter((report) => report.status === "draft").length,
    submitted: data.reports.filter((report) => report.status === "submitted").length,
    approved: data.reports.filter((report) => report.status === "approved").length,
    sent: data.reports.filter((report) => report.status === "sent").length,
  };

  return <AppShell universe="school" title="Reports" subtitle="Official term reports and release status." active="Reports" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card">
        <div><span className="module-overline">Official reporting</span><h3>Reports Centre</h3><p>Report records are shown against the learner&apos;s class for the selected term, not the learner&apos;s current class.</p></div>
        <div className="modal-actions"><Link className="button primary" href={`/school/report-cards${data.term ? `?term=${encodeURIComponent(data.term.id)}` : ""}`}>Open Report Card Studio →</Link><Link className="button secondary" href="/school/downloads">Downloads & exports</Link></div>
      </section>

      <section className="module-card">
        <div className="module-section-title"><div><span>Reporting context</span><h3>{data.term?.name ?? "Choose a reporting term"}</h3></div></div>
        <form className="module-toolbar" action="/school/reports" method="get">
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Term<select name="term" defaultValue={data.term?.id ?? ""}><option value="">Choose a term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Class<select name="classId" defaultValue={params.classId ?? ""}><option value="">All historical classes</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Status<select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">For review</option><option value="approved">Approved</option><option value="sent">Released</option></select></label>
          <button className="button primary" type="submit">Load reports</button>
        </form>
        {!data.term ? <p className="module-muted">There is no single active term today. Select a historical or future term explicitly instead of relying on a guessed “latest” term.</p> : null}
      </section>

      <section className="module-metrics"><article><span>Draft</span><strong>{counts.draft}</strong><small>Actual report records</small></article><article><span>For review</span><strong>{counts.submitted}</strong><small>Awaiting approval</small></article><article><span>Approved</span><strong>{counts.approved}</strong><small>Ready to release</small></article><article><span>Released</span><strong>{counts.sent}</strong><small>Published to families</small></article></section>

      <section className="module-card"><div className="module-section-title"><div><span>Report records</span><h3>Generated reports for the selected context</h3></div></div>
        <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Student</th><th>Term class</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>
          {data.reports.slice(0, 100).map((report) => <tr key={report.id}><td><strong>{report.student.name}</strong><small>{report.student.admissionNo}</small></td><td>{report.termClassLevel ? `${report.termClassLevel} · ` : ""}{report.termClassName}</td><td><span className="app-pill">{report.status}</span></td><td>{new Date(report.createdAt).toLocaleDateString("en-GH")}</td><td>{report.status === "approved" || report.status === "sent" ? <Link className="app-action" href={`/school/report-cards/${report.id}/print`}><strong>Print</strong> report</Link> : <Link className="app-action" href={`/school/report-cards?term=${encodeURIComponent(data.term?.id ?? "")}&classId=${encodeURIComponent(report.termClassId)}`}><strong>Open</strong> workflow</Link>}</td></tr>)}
          {!data.reports.length && <tr><td colSpan={5}><div className="module-empty"><strong>{data.term ? "No report records found." : "Choose a reporting term."}</strong>{data.term ? <Link href="/school/report-cards">Open Report Card Studio</Link> : null}</div></td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </AppShell>;
}
