import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ term?: string; classId?: string; status?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 8, select: { id: true, name: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
    ]);
    const term = terms.find((item) => item.id === params.term) ?? terms[0];
    const reports = term
      ? await tx.reportCard.findMany({
          where: {
            termId: term.id,
            ...(params.status ? { status: params.status } : {}),
            ...(params.classId ? { student: { classId: params.classId } } : {}),
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            student: { select: { name: true, admissionNo: true, classId: true, class: { select: { name: true, level: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : [];
    return { school, terms, term, classes, reports };
  });

  if (!data.school) return null;
  const counts = {
    draft: data.reports.filter((r) => r.status === "draft").length,
    submitted: data.reports.filter((r) => r.status === "submitted").length,
    approved: data.reports.filter((r) => r.status === "approved").length,
    sent: data.reports.filter((r) => r.status === "sent").length,
  };

  return <AppShell universe="school" title="Reports" subtitle="Monitor official report-card records and move directly into the real reporting workflow." active="Reports" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card">
        <div><span className="module-overline">Official reporting</span><h3>Reports Centre</h3><p>This page reports on actual generated report-card records. Report configuration, approval and release live in Report Card Studio.</p></div>
        <div className="modal-actions"><Link className="button primary" href={`/school/report-cards?term=${encodeURIComponent(data.term?.id ?? "")}`}>Open Report Card Studio →</Link><Link className="button secondary" href="/school/downloads">Downloads & exports</Link></div>
      </section>

      <section className="module-card">
        <div className="module-section-title"><div><span>Reporting context</span><h3>{data.term?.name ?? "No term selected"}</h3><p>Filter the real report records below. Nothing on this page is presented as completed until a database record exists.</p></div></div>
        <form className="module-toolbar" action="/school/reports" method="get">
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Term<select name="term" defaultValue={data.term?.id ?? ""}>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Class<select name="classId" defaultValue={params.classId ?? ""}><option value="">All classes</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, flex: 1 }}>Status<select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">For review</option><option value="approved">Approved</option><option value="sent">Released</option></select></label>
          <button className="button primary" type="submit">Load reports</button>
        </form>
      </section>

      <section className="module-metrics"><article><span>Draft</span><strong>{counts.draft}</strong><small>Actual report records</small></article><article><span>For review</span><strong>{counts.submitted}</strong><small>Awaiting approval</small></article><article><span>Approved</span><strong>{counts.approved}</strong><small>Ready to release</small></article><article><span>Released</span><strong>{counts.sent}</strong><small>Published to families</small></article></section>

      <section className="module-card"><div className="module-section-title"><div><span>Report records</span><h3>Generated reports for the selected context</h3></div></div>
        <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>
          {data.reports.slice(0, 100).map((report) => <tr key={report.id}><td><strong>{report.student.name}</strong><small>{report.student.admissionNo}</small></td><td>{report.student.class ? `${report.student.class.level ?? ""}${report.student.class.level ? " · " : ""}${report.student.class.name}` : "Unplaced"}</td><td><span className="app-pill">{report.status}</span></td><td>{new Date(report.createdAt).toLocaleDateString("en-GH")}</td><td>{report.status === "approved" || report.status === "sent" ? <Link className="app-action" href={`/school/report-cards/${report.id}/print`}><strong>Print</strong> report</Link> : <Link className="app-action" href={`/school/report-cards?term=${encodeURIComponent(data.term?.id ?? "")}&classId=${encodeURIComponent(report.student.classId ?? "")}`}><strong>Open</strong> workflow</Link>}</td></tr>)}
          {!data.reports.length && <tr><td colSpan={5}><div className="module-empty"><strong>No report records found.</strong><span>Complete the gradebook and use Report Card Studio to generate the selected class run.</span></div></td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </AppShell>;
}
