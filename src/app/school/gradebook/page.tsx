import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { getGradebookConfiguration } from "@/lib/academic-engine";
import { getClassSubjectPerformanceForRuntime, normalizeAssessmentRulesForRuntime } from "@/lib/gradebook-read-service";
import { resolveTermRoster } from "@/lib/student-term-context";
import { selectAcademicTerm } from "@/lib/term-date";
import { gradeForPercentage } from "@/lib/assessment-engine";
import { buildGradebookOversight } from "@/lib/gradebook-oversight";
import "../academic-workspace.css";
import "./gradebook-simple.css";

type SearchParams = Promise<{ view?: string; class?: string; subject?: string; week?: string; term?: string }>;
type WorkRow = {
  id: string;
  assessmentId: string | null;
  classId: string;
  subjectId: string;
  teacherId: string;
  kind: string;
  title: string;
  workDate: Date | string | null;
  weekNumber: number | null;
  maxScore: unknown;
  status: string;
};

const VIEWS = ["overview", "assessments", "marks", "insights"] as const;
type View = typeof VIEWS[number];

function queryHref(view: View, params: { classId?: string; subjectId?: string; week?: string; termId?: string }) {
  const query = new URLSearchParams({ view });
  if (params.classId) query.set("class", params.classId);
  if (params.subjectId) query.set("subject", params.subjectId);
  if (params.week) query.set("week", params.week);
  if (params.termId) query.set("term", params.termId);
  return `/school/gradebook?${query.toString()}`;
}

export default async function GradebookPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const requestedView = VIEWS.includes((params.view ?? "overview") as View) ? (params.view ?? "overview") as View : "overview";

  const access = await withTenant(session.schoolId, async (tx) => {
    const [canWriteAssigned, canModerate, canGenerateReports, canViewReports] = await Promise.all([
      hasPermission(tx, session.userId, "scores:write:assigned"),
      hasPermission(tx, session.userId, "scores:write:all"),
      hasPermission(tx, session.userId, "reports:generate"),
      hasPermission(tx, session.userId, "report_cards:view"),
    ]);
    if (!canWriteAssigned && !canModerate && !canGenerateReports && !canViewReports) await requirePermission(tx, session.userId, "report_cards:view");
    return { canWriteAssigned, canModerate, canGenerateReports, canViewReports };
  });

  // Assigned teaching users should use the focused mark-entry workspace. Leadership
  // gets the oversight Gradebook and enters corrections only through the explicit Marks tab.
  if (!access.canModerate && !access.canGenerateReports && access.canWriteAssigned) redirect("/school/gradebook/studio");

  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, rawConfig, settings, classes, subjects] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true, level: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
      tx.subject.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const normalized = normalizeAssessmentRulesForRuntime(rawConfig.assessment);
    const timezone = settings?.timezone || "Africa/Accra";
    const selectedTerm = selectAcademicTerm(rawConfig.terms, params.term, new Date(), timezone);
    if (!selectedTerm) return { school, classes, subjects, selectedTerm: null, offerings: [] as Array<{ classId: string; subjectId: string }>, oversight: null, performance: null, performanceIssue: null };

    const [roster, rawWorks, assessments, offerings] = await Promise.all([
      resolveTermRoster(tx, { schoolId: session.schoolId, termId: selectedTerm.id }),
      tx.$queryRawUnsafe<WorkRow[]>(
        `SELECT "id","assessmentId","classId","subjectId","teacherId","kind","title","workDate","weekNumber","maxScore","status" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "termId"=$2 ORDER BY "workDate" DESC,"weekNumber" DESC,"updatedAt" DESC`,
        session.schoolId,
        selectedTerm.id,
      ),
      tx.assessment.findMany({
        where: { schoolId: session.schoolId, termId: selectedTerm.id },
        select: {
          id: true, classId: true, subjectId: true, name: true, type: true, maxScore: true,
          scores: { select: { assessmentId: true, studentId: true, value: true, status: true } },
        },
        orderBy: { name: "asc" },
      }),
      tx.$queryRaw<Array<{ classId: string; subjectId: string }>>`
        SELECT "classId","subjectId" FROM "ClassSubjectOffering" WHERE "schoolId"=${session.schoolId}
      `,
    ]);

    const teacherIds = Array.from(new Set(rawWorks.map((work) => work.teacherId).filter(Boolean)));
    const teachers = teacherIds.length
      ? await tx.user.findMany({ where: { schoolId: session.schoolId, id: { in: teacherIds } }, select: { id: true, name: true } })
      : [];
    const teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));
    const rosterCounts = roster.reduce<Record<string, number>>((counts, student) => {
      if (student.termClassId) counts[student.termClassId] = (counts[student.termClassId] ?? 0) + 1;
      return counts;
    }, {});
    const works = rawWorks.map((work) => ({
      id: work.id,
      assessmentId: work.assessmentId,
      classId: work.classId,
      subjectId: work.subjectId,
      teacherName: teacherNames.get(work.teacherId) ?? null,
      kind: work.kind,
      title: work.title,
      workDate: work.workDate instanceof Date ? work.workDate.toISOString().slice(0, 10) : work.workDate ? String(work.workDate).slice(0, 10) : null,
      weekNumber: work.weekNumber == null ? null : Number(work.weekNumber),
      maxScore: Number(work.maxScore),
      status: work.status,
    }));
    const assessmentRows = assessments.map((assessment) => ({
      id: assessment.id,
      classId: assessment.classId,
      subjectId: assessment.subjectId,
      name: assessment.name,
      type: assessment.type,
      maxScore: Number(assessment.maxScore),
    }));
    const scores = assessments.flatMap((assessment) => assessment.scores.map((score) => ({
      assessmentId: score.assessmentId,
      studentId: score.studentId,
      value: Number(score.value),
      status: score.status,
    })));
    const oversight = buildGradebookOversight({ works, assessments: assessmentRows, scores, rosterCounts });

    let performance: Awaited<ReturnType<typeof getClassSubjectPerformanceForRuntime>> | null = null;
    let performanceIssue: string | null = null;
    if (params.class && params.subject) {
      try {
        performance = await getClassSubjectPerformanceForRuntime(tx, params.class, params.subject, selectedTerm.id, normalized.rules);
      } catch {
        performanceIssue = "This context cannot be calculated safely yet. Review assessment setup before relying on the final weighted result.";
      }
    }
    return { school, classes, subjects, selectedTerm, offerings, oversight, performance, performanceIssue };
  });

  const classMap = new Map(data.classes.map((item) => [item.id, item]));
  const subjectMap = new Map(data.subjects.map((item) => [item.id, item]));
  const classId = params.class || "";
  const subjectId = params.subject || "";
  const week = params.week || "";
  const availableSubjectIds = new Set(data.offerings.filter((item) => !classId || item.classId === classId).map((item) => item.subjectId));
  const visibleSubjects = data.subjects.filter((subject) => !classId || availableSubjectIds.has(subject.id));
  const allActivities = data.oversight?.activities ?? [];
  const activities = allActivities.filter((activity) =>
    (!classId || activity.classId === classId)
    && (!subjectId || activity.subjectId === subjectId)
    && (!week || String(activity.weekNumber ?? "") === week),
  );
  const expectedEntries = activities.reduce((sum, activity) => sum + activity.expected, 0);
  const enteredEntries = activities.reduce((sum, activity) => sum + activity.entered, 0);
  const missingEntries = activities.reduce((sum, activity) => sum + activity.missing, 0);
  const completionPct = expectedEntries ? Math.round((enteredEntries / expectedEntries) * 100) : 0;
  const incomplete = activities.filter((activity) => activity.missing > 0).sort((a, b) => b.missing - a.missing);
  const kindCounts = activities.reduce<Record<string, number>>((counts, activity) => {
    counts[activity.kind] = (counts[activity.kind] ?? 0) + 1;
    return counts;
  }, {});
  const weightedRows = data.performance?.rows ?? [];
  const completedWeighted = weightedRows.filter((row) => row.total != null);
  const weightedAverage = completedWeighted.length ? completedWeighted.reduce((sum, row) => sum + Number(row.total), 0) / completedWeighted.length : null;
  const weightedHighest = completedWeighted.length ? Math.max(...completedWeighted.map((row) => Number(row.total))) : null;
  const weightedLowest = completedWeighted.length ? Math.min(...completedWeighted.map((row) => Number(row.total))) : null;
  const needsAttention = weightedRows.filter((row) => row.total == null || Number(row.total) < 50);
  const selectedContext = classId && subjectId ? `${classMap.get(classId)?.name ?? "Class"} · ${subjectMap.get(subjectId)?.name ?? "Subject"}` : "School-wide";
  const context = { classId: classId || undefined, subjectId: subjectId || undefined, week: week || undefined, termId: data.selectedTerm?.id };

  return (
    <AppShell universe="school" title="Gradebook" subtitle="Leadership oversight for assessments, marks and academic performance." active="Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="academic-page">
        <AcademicWorkspaceNav current="gradebook" />
        <section className="academic-page-hero">
          <div className="academic-page-hero-copy">
            <span className="academic-page-overline">GRADEBOOK · LEADERSHIP OVERSIGHT</span>
            <h1>See what teachers have assessed before deciding where leadership needs to act.</h1>
            <p>The default Gradebook is read-first. Marks are corrected only through the explicit Marks workspace, while grading policy stays in Academic Setup.</p>
          </div>
          <div className="academic-page-hero-side">
            <div className="academic-page-context"><span className="academic-context-chip"><strong>Term</strong> {data.selectedTerm?.name ?? "No active term"}</span><span className="academic-context-chip"><strong>Scope</strong> {selectedContext}</span></div>
            <div className="academic-page-actions"><Link className="academic-btn-secondary" href="/school/academics/term-completion">Term completion</Link><Link className="academic-btn-secondary" href="/school/report-cards/operations">Report operations</Link></div>
          </div>
        </section>

        <nav className="academic-empty-actions" aria-label="Gradebook views">
          {VIEWS.map((view) => <Link key={view} href={queryHref(view, context)} aria-current={requestedView === view ? "page" : undefined}>{view === "overview" ? "Overview" : view === "assessments" ? "Assessments" : view === "marks" ? "Marks" : "Insights"}</Link>)}
        </nav>

        <section className="academic-context-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">WORKING CONTEXT</span><h2>Filter leadership oversight</h2><p>Choose a class first; subjects are limited to that class&apos;s curriculum. Week is optional.</p></div></div>
          <form className="academic-context-form" action="/school/gradebook" method="get">
            <input type="hidden" name="view" value={requestedView} />
            <div className="academic-field"><label htmlFor="owner-gradebook-class">Class</label><select id="owner-gradebook-class" name="class" defaultValue={classId}><option value="">All classes</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></div>
            <div className="academic-field"><label htmlFor="owner-gradebook-subject">Subject</label><select id="owner-gradebook-subject" name="subject" defaultValue={subjectId}><option value="">All subjects</option>{visibleSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="academic-field"><label htmlFor="owner-gradebook-week">Week</label><select id="owner-gradebook-week" name="week" defaultValue={week}><option value="">All weeks</option>{Array.from(new Set(allActivities.map((activity) => activity.weekNumber).filter((value): value is number => value != null))).sort((a, b) => a - b).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></div>
            <button className="academic-context-submit" type="submit">Apply filters</button>
          </form>
        </section>

        {!data.selectedTerm ? <section className="academic-empty"><strong>No active academic term is available.</strong><p>Gradebook oversight pauses rather than mixing records across terms.</p><div className="academic-empty-actions"><Link href="/school/terms">Open Academic Terms</Link></div></section> : requestedView === "overview" ? <>
          <section className="academic-stat-row">
            <div className="academic-stat"><span>Assessments</span><strong>{activities.length}</strong><small>{Object.entries(kindCounts).slice(0, 3).map(([kind, count]) => `${kind} ${count}`).join(" · ") || "No work yet"}</small></div>
            <div className="academic-stat"><span>Mark entry</span><strong>{completionPct}%</strong><small>{enteredEntries} of {expectedEntries} learner slots resolved</small></div>
            <div className="academic-stat"><span>Missing marks</span><strong>{missingEntries}</strong><small>{incomplete.length} assessment{incomplete.length === 1 ? "" : "s"} need attention</small></div>
            <div className="academic-stat"><span>Current term</span><strong>{data.selectedTerm.name}</strong><small>{data.selectedTerm.isLocked ? "Locked history" : "Open for academic work"}</small></div>
          </section>
          <section className="academic-main-grid">
            <div className="academic-work-card"><div className="academic-section-head"><div><span className="academic-page-overline">ACTIVITY HEALTH</span><h2>What needs leadership attention</h2><p>Assessments with the most unresolved learner marks appear first.</p></div><Link className="academic-btn-secondary" href={queryHref("assessments", context)}>All assessments</Link></div><div className="performance-table"><table className="performance-grid"><thead><tr><th>Activity</th><th>Class · Subject</th><th>Teacher</th><th>Entered</th><th>Status</th></tr></thead><tbody>{(incomplete.length ? incomplete : activities).slice(0, 12).map((activity) => <tr key={activity.assessmentId}><td><strong>{activity.title}</strong><br/><small>{activity.kind}{activity.weekNumber ? ` · Week ${activity.weekNumber}` : ""}</small></td><td>{classMap.get(activity.classId)?.name ?? "Class"} · {subjectMap.get(activity.subjectId)?.name ?? "Subject"}</td><td>{activity.teacherName ?? "Direct / legacy"}</td><td>{activity.entered}/{activity.expected}</td><td>{activity.missing ? `${activity.missing} missing` : "Complete"}</td></tr>)}</tbody></table></div></div>
            <aside className="academic-side-stack"><div className="academic-side-card"><span className="academic-page-overline">LEADERSHIP RULE</span><strong>Oversight first, correction second</strong><small>Leadership can see completeness and results without accidentally becoming the classroom teacher. Use Marks only for an intentional correction or support action.</small><div className="academic-link-list"><Link href={queryHref("marks", context)}>Open Marks <span>→</span></Link><Link href="/school/academics/setup">Grading policy <span>→</span></Link></div></div></aside>
          </section>
        </> : requestedView === "assessments" ? <section className="academic-work-card"><div className="academic-section-head"><div><span className="academic-page-overline">ASSESSMENTS</span><h2>Teaching work and assessment register</h2><p>Homework, exercises, quizzes, participation, classwork and exams are one assessment stream here.</p></div></div><div className="performance-table"><table className="performance-grid"><thead><tr><th>Activity</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Week</th><th>Out of</th><th>Marks</th><th>Average</th></tr></thead><tbody>{activities.map((activity) => <tr key={activity.assessmentId}><td><strong>{activity.title}</strong><br/><small>{activity.kind}</small></td><td>{classMap.get(activity.classId)?.name ?? "—"}</td><td>{subjectMap.get(activity.subjectId)?.name ?? "—"}</td><td>{activity.teacherName ?? "Direct / legacy"}</td><td>{activity.weekNumber ?? "—"}</td><td>{activity.maxScore}</td><td>{activity.entered}/{activity.expected}</td><td>{activity.averagePct == null ? "—" : `${activity.averagePct.toFixed(1)}%`}</td></tr>)}</tbody></table></div>{activities.length === 0 ? <div className="academic-empty"><strong>No assessments match this context.</strong><p>Teachers create ordinary mark sheets from My Gradebook; online assessments remain optional.</p></div> : null}</section> : requestedView === "marks" ? <section className="academic-work-card"><div className="academic-section-head"><div><span className="academic-page-overline">MARKS</span><h2>Choose the mark sheet to inspect or correct</h2><p>Opening a mark sheet is an explicit action. The leadership Gradebook itself remains read-first.</p></div></div><div className="performance-table"><table className="performance-grid"><thead><tr><th>Activity</th><th>Context</th><th>Completeness</th><th>Action</th></tr></thead><tbody>{activities.map((activity) => <tr key={activity.assessmentId}><td><strong>{activity.title}</strong><br/><small>{activity.kind}{activity.weekNumber ? ` · Week ${activity.weekNumber}` : ""}</small></td><td>{classMap.get(activity.classId)?.name ?? "Class"} · {subjectMap.get(activity.subjectId)?.name ?? "Subject"}</td><td>{activity.completionPct}% · {activity.missing} missing</td><td>{access.canModerate ? <Link href={`/school/gradebook/studio?class=${encodeURIComponent(activity.classId)}&subject=${encodeURIComponent(activity.subjectId)}`}>Open mark sheet →</Link> : "Read only"}</td></tr>)}</tbody></table></div></section> : <>
          {data.performanceIssue ? <section className="academic-empty"><strong>Insights are paused for this context.</strong><p>{data.performanceIssue}</p><div className="academic-empty-actions"><Link href="/school/academics/setup">Review grading setup</Link></div></section> : !classId || !subjectId ? <section className="academic-empty"><strong>Choose one class and subject for weighted insights.</strong><p>School-wide assessment completion remains available in Overview. Weighted learner results need one real class-subject context.</p></section> : <>
            <section className="academic-stat-row"><div className="academic-stat"><span>Weighted class average</span><strong>{weightedAverage == null ? "—" : `${weightedAverage.toFixed(1)}%`}</strong><small>Completed learner totals</small></div><div className="academic-stat"><span>Highest</span><strong>{weightedHighest == null ? "—" : `${weightedHighest.toFixed(1)}%`}</strong><small>Highest weighted subject result</small></div><div className="academic-stat"><span>Lowest</span><strong>{weightedLowest == null ? "—" : `${weightedLowest.toFixed(1)}%`}</strong><small>Lowest completed result</small></div><div className="academic-stat"><span>Needs attention</span><strong>{needsAttention.length}</strong><small>Incomplete or below 50%</small></div></section>
            <section className="academic-work-card"><div className="academic-section-head"><div><span className="academic-page-overline">INSIGHTS</span><h2>{selectedContext}</h2><p>{data.selectedTerm?.name} · same weighted engine used by reports.</p></div></div><div className="performance-table"><table className="performance-grid"><thead><tr><th>Learner</th><th>Weighted result</th><th>Grade</th><th>Status</th></tr></thead><tbody>{weightedRows.map((row) => { const total = row.total == null ? null : Number(row.total); return <tr key={row.student.id}><td><strong>{row.student.name}</strong><br/><small>{row.student.admissionNo}</small></td><td>{total == null ? "—" : `${total.toFixed(2)}%`}</td><td>{total == null ? "—" : gradeForPercentage(total)}</td><td>{total == null ? "Incomplete" : total < 50 ? "Needs attention" : "On track"}</td></tr>; })}</tbody></table></div></section>
          </>}
        </>}
      </div>
    </AppShell>
  );
}
