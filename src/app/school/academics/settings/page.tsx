import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { isTermActive } from "@/lib/term-date";
import "../../academic-workspace.css";

export default async function AcademicSettingsPage() {
  const session = await requireSchoolSession();
  const now = new Date();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_school");
    const [school, settings, terms, config, classCount, offeringCount, structureRows] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: true }, orderBy: { startDate: "desc" }, take: 12 }),
      getAcademicEngineConfig(tx, session.schoolId),
      tx.class.count({ where: { schoolId: session.schoolId } }),
      tx.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS "count" FROM "ClassSubjectOffering" WHERE "schoolId"=${session.schoolId}`,
      tx.$queryRawUnsafe<Array<{ frameworks: number; levels: number; sections: number }>>(
        `SELECT
           (SELECT COUNT(*)::int FROM "AcademicFramework" WHERE "schoolId"=$1 AND "status"='active') AS "frameworks",
           (SELECT COUNT(*)::int FROM "GradeLevel" WHERE "schoolId"=$1 AND "isActive"=true) AS "levels",
           (SELECT COUNT(*)::int FROM "ClassSection" WHERE "schoolId"=$1 AND "isActive"=true) AS "sections"`,
        session.schoolId,
      ),
    ]);
    const currentTerm = terms.find((term) => isTermActive(term, now, settings?.timezone || "Africa/Accra")) ?? null;
    const teachingWeeks = currentTerm
      ? await tx.$queryRaw<Array<{ teachingWeeks: number }>>`SELECT COALESCE("teachingWeeks",13)::int AS "teachingWeeks" FROM "Term" WHERE "schoolId"=${session.schoolId} AND "id"=${currentTerm.id} LIMIT 1`
      : [];
    return {
      school,
      terms,
      currentTerm,
      teachingWeeks: teachingWeeks[0]?.teachingWeeks ?? null,
      config,
      classCount,
      offeringCount: offeringCount[0]?.count ?? 0,
      structure: structureRows[0] ?? { frameworks: 0, levels: 0, sections: 0 },
    };
  });

  const categories = data.config.assessment.categories ?? [];
  const totalWeight = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0);
  const currentTerm = data.currentTerm;
  const termLabel = currentTerm ? `${currentTerm.name} · ${currentTerm.academicYear.name}` : "No active term";

  return <AppShell
    universe="school"
    title="Academic Settings"
    subtitle="Structure, calendar, grading rules and term readiness in one place."
    active="Academic Settings"
    schoolName={data.school?.name ?? "School Workspace"}
    schoolCode={data.school?.uniqueCode ?? ""}
    userName={session.name}
    role="Academic leadership"
  >
    <div className="academic-page">
      <section className="academic-page-hero">
        <div className="academic-page-hero-copy">
          <span className="academic-page-overline">ACADEMIC SETTINGS · ONE CONTROL POINT</span>
          <h1>Configure the school year from structure through finalisation.</h1>
          <p>This hub controls the grade ladder, class sections, academic calendar, grading rules and term completion workflow. Daily teacher marks stay in Gradebook.</p>
        </div>
        <div className="academic-page-hero-side">
          <div className="academic-page-context">
            <span className="academic-context-chip"><strong>Working term</strong> {termLabel}</span>
            <span className="academic-context-chip"><strong>Teaching weeks</strong> {data.teachingWeeks ?? "—"}</span>
            <span className="academic-context-chip"><strong>Grading policy</strong> {totalWeight}%</span>
          </div>
        </div>
      </section>

      <section className="academic-stat-row">
        <div className="academic-stat"><span>Grade levels</span><strong>{data.structure.levels}</strong><small>{data.structure.frameworks ? `${data.structure.frameworks} academic framework${data.structure.frameworks === 1 ? "" : "s"}` : "Structure not configured"}</small></div>
        <div className="academic-stat"><span>Classes</span><strong>{data.classCount}</strong><small>{data.structure.sections} annual section mappings</small></div>
        <div className="academic-stat"><span>Class subjects</span><strong>{data.offeringCount}</strong><small>Curriculum offerings</small></div>
        <div className="academic-stat"><span>Assessment categories</span><strong>{categories.length}</strong><small>{totalWeight === 100 ? "Weights total 100%" : `Weights total ${totalWeight}%`}</small></div>
      </section>

      <section className="academic-main-grid">
        <div className="academic-work-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">01 · SCHOOL STRUCTURE</span><h2>Grades, sections & year rollover</h2><p>Define Creche/Nursery/KG/Basic/JHS/SHS or another framework, map A/B/C sections by academic year, and preview promotion into the next year before committing it.</p></div><Link className="academic-btn-secondary" href="/school/academics/structure">Open school structure</Link></div>
          <div className="academic-empty-actions"><Link href="/school/academics/structure">Grade & section setup</Link><Link href="/school/academics/structure">Year-end rollover</Link></div>
        </div>
        <div className="academic-work-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">02 · READINESS</span><h2>Academic readiness</h2><p>Check calendar, curriculum, teacher ownership, assessment activity and report setup before the school depends on them.</p></div><Link className="academic-btn-secondary" href="/school/academics/health">Run readiness check</Link></div>
          <div className="academic-empty-actions"><Link href="/school/classes">Classes & curriculum</Link><Link href="/school/timetable">Timetable</Link><Link href="/school/gradebook">Gradebook</Link></div>
        </div>
        <div className="academic-work-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">03 · RULES</span><h2>Academic rules & grading</h2><p>Teaching days, lesson times, assessment categories, weighting and report behaviour remain centrally controlled.</p></div><Link className="academic-btn-secondary" href="/school/academics/setup">Open academic rules</Link></div>
          <div className="academic-empty-actions"><Link href="/school/subjects">Subject library</Link><Link href="/school/settings/reporting">Reporting settings</Link></div>
        </div>
        <div className="academic-work-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">04 · YEAR, TERMS & WEEKS</span><h2>Academic calendar</h2><p>Create academic years and terms, set their dates and teaching-week count, and manage the lock/reopen lifecycle from one authoritative timeline.</p></div><Link className="academic-btn-secondary" href="/school/terms">Open academic terms</Link></div>
          <p>{currentTerm ? `${currentTerm.name} currently drives teacher work and mark entry automatically.` : "No term is active right now. Create or review the academic calendar before teachers record work."}</p>
        </div>
        <div className="academic-work-card">
          <div className="academic-section-head"><div><span className="academic-page-overline">05 · FINALISE</span><h2>Term completion</h2><p>Before closing a term, verify staffing, assessments, explicit score dispositions, grading policy and report-card finalisation.</p></div><Link className="academic-btn-secondary" href="/school/academics/term-completion">Open completion control room</Link></div>
          <div className="academic-empty-actions"><Link href="/school/report-cards/operations">Report operations</Link><Link href="/school/gradebook?view=overview">Leadership Gradebook</Link></div>
        </div>
      </section>

      <section className="academic-empty">
        <strong>Secondary libraries stay available without crowding the main academic menu.</strong>
        <p>Subjects remain a reusable school catalogue and historical routes remain compatible, but structure now defines progression, Classes define the teaching groups, and Gradebook handles daily marks.</p>
        <div className="academic-empty-actions"><Link href="/school/subjects">Open subject library</Link><Link href="/school/library">Library & resources</Link></div>
      </section>
    </div>
  </AppShell>;
}
