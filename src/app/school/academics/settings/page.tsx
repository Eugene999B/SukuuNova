import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Layers3,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
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
  const structureReady = data.structure.frameworks > 0 && data.structure.levels > 0;
  const gradingReady = categories.length > 0 && totalWeight === 100;

  return <AppShell
    universe="school"
    title="Academic Settings"
    subtitle="Set up your school structure, calendar, grading and term operations."
    active="Academic Settings"
    schoolName={data.school?.name ?? "School Workspace"}
    schoolCode={data.school?.uniqueCode ?? ""}
    userName={session.name}
    role="Academic leadership"
  >
    <div className="academic-page academic-settings-page">
      <section className="academic-settings-hero">
        <div className="academic-settings-hero-copy">
          <span className="academic-page-overline">Academic setup</span>
          <h1>Set up academics in the order your school actually works.</h1>
          <p>Start with school structure, confirm the academic year, define grading rules, then run a readiness check before staff begin daily academic work.</p>
          <div className="academic-settings-hero-actions">
            <Link className="academic-settings-primary" href="/school/academics/structure">Start with school structure <ArrowRight size={15} /></Link>
            <Link className="academic-settings-secondary-button" href="/school/academics/health">Run readiness check</Link>
          </div>
        </div>
        <div className="academic-settings-context-panel">
          <span className="academic-settings-context-label">Current academic context</span>
          <div className="academic-settings-context-item"><span>Working term</span><strong>{termLabel}</strong></div>
          <div className="academic-settings-context-item"><span>Teaching weeks</span><strong>{data.teachingWeeks ?? "—"}</strong></div>
          <div className="academic-settings-context-item"><span>Grading policy</span><strong>{totalWeight}%</strong></div>
        </div>
      </section>

      {!structureReady ? <section className="academic-settings-alert is-warning">
        <span className="academic-settings-alert-icon"><TriangleAlert size={18} /></span>
        <div><strong>School structure still needs attention.</strong><p>Grade levels are not configured yet. Set up the grade ladder and sections so classes, promotion and year rollover have a clear structure.</p></div>
        <Link href="/school/academics/structure">Fix school structure <ArrowRight size={14} /></Link>
      </section> : <section className="academic-settings-alert is-ready">
        <span className="academic-settings-alert-icon"><CheckCircle2 size={18} /></span>
        <div><strong>School structure is configured.</strong><p>Your grade framework is available. Continue through calendar, grading and readiness before closing setup.</p></div>
        <Link href="/school/academics/health">Check readiness <ArrowRight size={14} /></Link>
      </section>}

      <section className="academic-stat-row academic-settings-stats">
        <div className={`academic-stat ${structureReady ? "" : "is-warning"}`}><span>Grade levels</span><strong>{data.structure.levels}</strong><small>{data.structure.frameworks ? `${data.structure.frameworks} active academic framework${data.structure.frameworks === 1 ? "" : "s"}` : "Structure not configured"}</small></div>
        <div className="academic-stat"><span>Classes</span><strong>{data.classCount}</strong><small>{data.structure.sections} annual section mappings</small></div>
        <div className="academic-stat"><span>Class subjects</span><strong>{data.offeringCount}</strong><small>Curriculum offerings</small></div>
        <div className={`academic-stat ${gradingReady ? "" : "is-warning"}`}><span>Assessment categories</span><strong>{categories.length}</strong><small>{totalWeight === 100 ? "Weights total 100%" : `Weights currently total ${totalWeight}%`}</small></div>
      </section>

      <section className="academic-settings-grid">
        <article className="academic-settings-card">
          <div className="academic-settings-card-heading"><span className="academic-settings-card-icon"><Layers3 size={19} /></span><div><span className="academic-page-overline">01 · Structure</span><h2>Grades, classes & sections</h2></div></div>
          <p>Define the school ladder — Creche, Nursery, KG, Basic, JHS, SHS or your own framework — then map sections and prepare year-end rollover.</p>
          <div className="academic-settings-card-status"><strong>{data.structure.levels} grade levels</strong><span>{data.structure.sections} section mappings</span></div>
          <div className="academic-settings-card-actions"><Link href="/school/academics/structure">Grade & section setup <ArrowRight size={14} /></Link><Link href="/school/academics/structure">Year-end rollover</Link></div>
        </article>

        <article className="academic-settings-card">
          <div className="academic-settings-card-heading"><span className="academic-settings-card-icon"><ClipboardCheck size={19} /></span><div><span className="academic-page-overline">02 · Readiness</span><h2>Academic readiness</h2></div></div>
          <p>Check the calendar, curriculum, teacher ownership, assessment activity and report setup before the school depends on them.</p>
          <div className="academic-settings-card-status"><strong>Pre-term control</strong><span>Find gaps before teachers do</span></div>
          <div className="academic-settings-card-actions"><Link href="/school/academics/health">Run readiness check <ArrowRight size={14} /></Link><Link href="/school/timetable">Timetable</Link><Link href="/school/gradebook">Gradebook</Link></div>
        </article>

        <article className="academic-settings-card">
          <div className="academic-settings-card-heading"><span className="academic-settings-card-icon"><SlidersHorizontal size={19} /></span><div><span className="academic-page-overline">03 · Rules & grading</span><h2>Academic rules & grading</h2></div></div>
          <p>Control teaching days, lesson times, assessment categories, weights and report behaviour from one place.</p>
          <div className="academic-settings-card-status"><strong>{totalWeight}% assessment weight</strong><span>{gradingReady ? "Grading policy balanced" : "Review grading weights"}</span></div>
          <div className="academic-settings-card-actions"><Link href="/school/academics/setup">Open academic rules <ArrowRight size={14} /></Link><Link href="/school/subjects">Subject library</Link><Link href="/school/settings/reporting">Reporting</Link></div>
        </article>

        <article className="academic-settings-card">
          <div className="academic-settings-card-heading"><span className="academic-settings-card-icon"><CalendarDays size={19} /></span><div><span className="academic-page-overline">04 · Academic year</span><h2>Terms, sessions & vacations</h2></div></div>
          <p>Plan terms or semesters, teaching periods, vacations and instructional days. The final session drives year-end promotion.</p>
          <div className="academic-settings-card-status"><strong>{currentTerm ? currentTerm.academicYear.name : "No active year"}</strong><span>{currentTerm ? currentTerm.name : "Create or activate an academic session"}</span></div>
          <div className="academic-settings-card-actions"><Link href="/school/academics/calendar">Plan academic year <ArrowRight size={14} /></Link><Link href="/school/terms">Term operations</Link></div>
        </article>

        <article className="academic-settings-card academic-settings-card-wide">
          <div className="academic-settings-card-heading"><span className="academic-settings-card-icon"><GraduationCap size={19} /></span><div><span className="academic-page-overline">05 · Finalise</span><h2>Complete the term with confidence</h2></div></div>
          <p>Before closing a term, verify staffing, assessments, score dispositions, grading policy, report cards and class-teacher year-end decisions. This is where leadership confirms the term is truly complete.</p>
          <div className="academic-settings-finalise-row">
            <div><BookOpenCheck size={17} /><span><strong>Report cards</strong><small>Review and finalise reports</small></span></div>
            <div><CheckCircle2 size={17} /><span><strong>Completion checks</strong><small>Resolve missing academic work</small></span></div>
          </div>
          <div className="academic-settings-card-actions"><Link href="/school/academics/calendar">Open closing control <ArrowRight size={14} /></Link><Link href="/school/report-cards/operations">Report operations</Link><Link href="/school/gradebook?view=overview">Leadership Gradebook</Link></div>
        </article>
      </section>

      <section className="academic-settings-secondary">
        <div><span className="academic-page-overline">Supporting libraries</span><h3>Keep reusable academic resources close, without crowding the main setup flow.</h3><p>Subjects remain the school catalogue, while Library & Resources stores teaching materials used across the academic workspace.</p></div>
        <div className="academic-settings-secondary-actions"><Link href="/school/subjects">Subject library</Link><Link href="/school/library">Library & resources</Link></div>
      </section>
    </div>
  </AppShell>;
}
