import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getClassSubjectPerformance } from "@/lib/academic-engine";
import { gradeForPercentage } from "@/lib/assessment-engine";

function positions(rows: Array<{ student: { id: string }; total: number | null }>) {
  const ranked = [...rows].filter((row) => row.total != null).sort((a, b) => Number(b.total) - Number(a.total));
  let last: number | null = null; let rank = 0;
  const out = new Map<string, number>();
  ranked.forEach((row, index) => { const value = Number(row.total); if (value !== last) rank = index + 1; out.set(row.student.id, rank); last = value; });
  return out;
}

export default async function PerformanceStudioPage({ searchParams }: { searchParams: Promise<{ class?: string; subject?: string; term?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "reports:view");
    const [school, classes, subjects, terms, assignments] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ select: { id: true, name: true, level: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
      tx.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.term.findMany({ select: { id: true, name: true }, orderBy: { startDate: "desc" }, take: 12 }),
      tx.classSubjectTeacher.findMany({ include: { class: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } } })
    ]);
    const term = terms.find((item) => item.id === params.term) ?? terms[0];
    const assignment = assignments.find((item) => item.classId === params.class && item.subjectId === params.subject);
    const performance = assignment && term ? await getClassSubjectPerformance(tx, assignment.classId, assignment.subjectId, term.id) : null;
    return { school, classes, subjects, terms, term, assignment, performance };
  });
  const rows = data.performance?.rows ?? [];
  const scored = rows.filter((row) => row.total != null);
  const average = scored.length ? scored.reduce((sum, row) => sum + Number(row.total), 0) / scored.length : null;
  const ranks = positions(rows);
  const attention = rows.filter((row) => row.total == null || Number(row.total) < 50);

  return <AppShell universe="school" title="Performance Studio" subtitle="See how learners are performing, where the class is strong, and who needs a closer look." active="Performance Studio" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="app-banner"><div><h3>Turn marks into decisions.</h3><p>The figures here come from the same weighted calculation used by Gradebook Studio, so teachers and administrators are looking at the same result.</p></div><Link className="app-action" href="/school/gradebook/studio"><strong>Open Gradebook</strong>Enter marks</Link></div>
    <section className="app-card app-panel"><div className="app-card-head"><div><h2>Choose a review</h2><p>Pick a class, subject and term. Only existing class-subject assignments can be analysed.</p></div></div><form style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}><label>Class<select name="class" defaultValue={params.class ?? ""}><option value="">Choose…</option>{data.classes.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subject<select name="subject" defaultValue={params.subject ?? ""}><option value="">Choose…</option>{data.subjects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Term<select name="term" defaultValue={data.term?.id ?? ""}>{data.terms.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="app-action" type="submit"><strong>Analyse</strong>Review</button></form></section>
    {!data.performance ? <section className="app-card app-panel"><h2>Choose a class and subject</h2><p>Once a valid assignment and term are selected, the page will show the live class results, positions and learners who may need support.</p></section> : <>
      <section className="app-grid kpis"><div className="app-card app-kpi"><span className="app-kpi-label">Class average</span><div className="app-kpi-value">{average == null ? "—" : `${average.toFixed(1)}%`}</div><div className="app-kpi-meta">Weighted result across completed learners</div></div><div className="app-card app-kpi"><span className="app-kpi-label">Completed</span><div className="app-kpi-value">{scored.length}/{rows.length}</div><div className="app-kpi-meta">Complete subject results</div></div><div className="app-card app-kpi"><span className="app-kpi-label">Highest</span><div className="app-kpi-value">{scored.length ? `${Number(scored[0].total).toFixed(1)}%` : "—"}</div><div className="app-kpi-meta">Current strongest result</div></div><div className="app-card app-kpi"><span className="app-kpi-label">Needs attention</span><div className="app-kpi-value">{attention.length}</div><div className="app-kpi-meta">Incomplete or below 50%</div></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><h2>{data.assignment?.subject.name} · {data.assignment?.class.name}</h2><p>{data.term?.name} · ranked by the current weighted subject result</p></div><Link className="app-pill" href="/api/school/exports/gradebook.csv">Export gradebook</Link></div>{rows.map((row) => <div className="app-list-row" key={row.student.id}><div><b>{row.student.name}</b><span>{row.student.admissionNo} · {row.total == null ? "Incomplete result" : `${Number(row.total).toFixed(2)}% · Grade ${gradeForPercentage(row.total)}`}</span></div><span className="app-pill">{ranks.get(row.student.id) ? `Position ${ranks.get(row.student.id)}` : "—"}</span>{row.total == null || Number(row.total) < 50 ? <span className="app-pill">Needs attention</span> : null}</div>)}</section>
      <div className="app-dashboard-grid"><section className="app-card app-panel"><h2>Teacher action list</h2><p>{attention.length === 0 ? "Nothing is currently flagged for this view." : `${attention.length} learner(s) are incomplete or below 50%. Review their assessment breakdown before the term closes.`}</p><Link className="app-action" href="/school/academics/term-completion"><strong>Check term readiness</strong>Find wider blockers</Link></section><section className="app-card app-panel"><h2>How the position works</h2><p>Ties share the same position. Learners without a complete weighted result are not ranked until the missing work is resolved.</p></section></div>
    </>}
  </AppShell>;
}
