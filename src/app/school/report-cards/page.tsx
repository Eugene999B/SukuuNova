import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function ReportCardsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const [school, terms, templates, reportCounts, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.term.findMany({ orderBy: { startDate: "desc" }, take: 8, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.reportCardTemplate.findMany({ where: { OR: [{ schoolId: session.schoolId }, { schoolId: null }] }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
      tx.reportCard.groupBy({ by: ["status"], _count: { _all: true } }),
      tx.class.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, level: true } })
    ]);
    return { school, terms, templates, reportCounts, classes };
  });
  const counts = Object.fromEntries(data.reportCounts.map((row) => [row.status, row._count._all]));
  const term = data.terms[0];
  return <AppShell universe="school" title="Report Card Studio" subtitle="Prepare beautiful, consistent school reports from verified results. Review first, approve properly, then release to families." active="Report Cards" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Term reporting</span><h3>Turn a finished gradebook into a school-ready report.</h3><p>SukuuNova keeps generation, class-teacher submission, approval and family release as separate steps. That way a report can look polished without losing the controls that make it trustworthy.</p></div><div className="module-setup-list"><Link href="/school/academics/term-completion"><span>1</span>Check readiness <b>{term ? term.name : "Choose a term"}</b></Link><Link href="/school/gradebook/studio"><span>2</span>Finish marks <b>Use the shared calculation engine</b></Link><Link href="#templates"><span>3</span>Choose presentation <b>{data.templates.length} template(s) available</b></Link><Link href="#batch"><span>4</span>Generate class pack <b>One student per printable page</b></Link></div></section>

      <section className="module-metrics"><article><span>Draft</span><strong>{counts.draft ?? 0}</strong><small>Still being prepared</small></article><article><span>For review</span><strong>{counts.submitted ?? 0}</strong><small>Awaiting approval</small></article><article><span>Approved</span><strong>{counts.approved ?? 0}</strong><small>Ready to release</small></article><article><span>Released</span><strong>{counts.sent ?? 0}</strong><small>Available to families</small></article></section>

      <section className="module-card" id="templates"><div className="module-section-title"><div><span>Presentation</span><h3>Report-card templates</h3><p>The template controls the look; the calculation engine controls the numbers.</p></div></div><div className="module-selector-grid">{data.templates.length === 0 ? <div className="module-empty">No report-card templates exist yet. Create a school template before issuing reports.</div> : data.templates.map((template) => <div className="module-selector-card" key={template.id}><strong>{template.name}</strong><span>{template.id.startsWith("preset-") ? "SukuuNova preset" : "School template"}</span><small>Logo · school identity · results · remarks · signatures</small></div>)}</div></section>

      <section className="module-card" id="batch"><div className="module-section-title"><div><span>Batch reporting</span><h3>Generate by class</h3><p>Choose a class to prepare its report-card run. Final PDF generation should only be enabled once readiness checks are clear.</p></div></div>{data.classes.length === 0 ? <div className="module-empty">Create classes before generating reports.</div> : data.classes.map((cls) => <div className="app-list-row" key={cls.id}><div><b>{cls.name}</b><span>{cls.level ?? "Class"} · Term: {term?.name ?? "Not configured"}</span></div><Link className="app-action" href={`/school/reports?classId=${encodeURIComponent(cls.id)}&termId=${encodeURIComponent(term?.id ?? "")}`}><strong>Prepare</strong>report run</Link></div>)}</section>

      <section className="module-card"><div className="module-section-title"><div><span>Download promise</span><h3>Reports should leave SukuuNova beautifully</h3><p>Our target output is a printer-friendly A4 PDF, one learner per page, with consistent margins, school identity, results, positions, attendance, remarks and signature areas. A class pack can then be printed at once.</p></div></div><div className="module-workflow"><div className="module-workflow-step"><span>01</span><div><strong>Calculate</strong><small>Use the shared academic engine.</small></div></div><div className="module-workflow-step"><span>02</span><div><strong>Snapshot</strong><small>Freeze the numbers used for the issued report.</small></div></div><div className="module-workflow-step"><span>03</span><div><strong>Approve</strong><small>Keep class-teacher and reviewer responsibilities separate.</small></div></div><div className="module-workflow-step"><span>04</span><div><strong>Release</strong><small>Make the approved copy available to the right family account.</small></div></div></div></section>
    </div>
  </AppShell>;
}
