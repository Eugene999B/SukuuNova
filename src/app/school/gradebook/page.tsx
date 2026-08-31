import Link from "next/link";
import { ArrowRight, ClipboardCheck, GraduationCap, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cacheTenantRead } from "@/lib/server-cache";
import "./gradebook-workspace.css";

async function getGradebookSummary(schoolId: string, userId: string, canModerate: boolean) {
  const cached = cacheTenantRead(["gradebook-summary", schoolId, userId, canModerate ? "moderate" : "assigned"], async () => withTenant(schoolId, async tx => {
    const [assignments, assessmentCount, studentCount, termCount] = await Promise.all([
      tx.classSubjectTeacher.count({ where: canModerate ? {} : { teacherId: userId } }),
      tx.assessment.count({ where: { schoolId } }),
      tx.student.count({ where: { schoolId, status: "active" } }),
      tx.term.count({ where: { schoolId } })
    ]);
    return { assignments, assessmentCount, studentCount, termCount };
  }), 30, [`gradebook:${schoolId}`]);
  return cached();
}

export default async function GradebookPage(){
  const session=await requireSchoolSession();
  const permissions = await withTenant(session.schoolId, async tx => {
    const canWrite=await hasPermission(tx,session.userId,"scores:write:assigned");
    const canModerate=await hasPermission(tx,session.userId,"scores:write:all");
    if(!canWrite&&!canModerate) await requirePermission(tx,session.userId,"report_cards:view");
    return { canWrite, canModerate };
  });
  const data = { ...permissions, ...await getGradebookSummary(session.schoolId, session.userId, permissions.canModerate) };
  return <AppShell universe="school" title="Gradebook" subtitle="The results hub connecting classroom mark entry, performance analysis and report-card readiness." active="Gradebook"><div className="gradebook-shell"><section className="gradebook-hero"><div><span className="gradebook-kicker">RESULTS CONTROL CENTRE</span><h2>{data.canModerate?"See the school-wide result picture.":"Keep your results accurate and on time."}</h2><p>{data.canModerate?"Leadership moderates the same protected calculations teachers use, without taking classroom ownership away from assigned teachers.":"Your gradebook work stays within the classes and subjects assigned to your account."}</p></div><div className="gradebook-hero-actions"><Link className="gradebook-primary" href="/school/gradebook/studio">Open Gradebook Studio <ArrowRight size={14} aria-hidden="true" /></Link>{data.canModerate?<Link className="gradebook-secondary" href="/school/academics/performance">Performance Studio <SlidersHorizontal size={14} aria-hidden="true" /></Link>:null}</div></section><section className="gradebook-kpis"><article><span className="gradebook-kpi-icon"><GraduationCap size={16} aria-hidden="true" /></span><span>Teaching links</span><strong>{data.assignments}</strong><small>{data.canModerate?"School assignments":"Your assigned class-subject links"}</small></article><article><span className="gradebook-kpi-icon"><ClipboardCheck size={16} aria-hidden="true" /></span><span>Assessments</span><strong>{data.assessmentCount}</strong><small>Assessment records in the school</small></article><article><span className="gradebook-kpi-icon"><GraduationCap size={16} aria-hidden="true" /></span><span>Active learners</span><strong>{data.studentCount}</strong><small>Current learner population</small></article><article><span className="gradebook-kpi-icon"><ShieldCheck size={16} aria-hidden="true" /></span><span>Terms</span><strong>{data.termCount}</strong><small>Available academic periods</small></article></section><section className="gradebook-grid"><article className="gradebook-card"><span className="gradebook-kicker">01 · ENTER</span><h3>Gradebook Studio</h3><p>Choose class, subject and term. Teachers enter marks only where they are assigned; academic leaders can moderate broader result sets.</p><Link href="/school/gradebook/studio" className="gradebook-link">Open mark entry <ArrowRight size={14} aria-hidden="true" /></Link></article><article className="gradebook-card"><span className="gradebook-kicker">02 · ANALYSE</span><h3>Performance Studio</h3><p>Turn weighted results into positions, averages and learner-support actions for the selected teaching context.</p><Link href="/school/academics/performance" className="gradebook-link">Analyse performance <ArrowRight size={14} aria-hidden="true" /></Link></article><article className="gradebook-card"><span className="gradebook-kicker">03 · PREPARE</span><h3>Report-card chain</h3><p>Results become reporting evidence after the school’s assessment and term rules are satisfied.</p><Link href="/school/report-cards" className="gradebook-link">Open report cards <ArrowRight size={14} aria-hidden="true" /></Link></article><article className="gradebook-card"><span className="gradebook-kicker">04 · CHECK</span><h3>Academic readiness</h3><p>Find wider blockers such as missing class assignments, timetable rules, assessment weights or learner placement.</p><Link href="/school/academics/health" className="gradebook-link">Run readiness check <ArrowRight size={14} aria-hidden="true" /></Link></article></section><section className="gradebook-footer"><div><b>Role boundary</b><p>Teachers produce marks. Academic leaders verify and moderate. Owners monitor the whole chain and retain governance rights.</p></div><Link href="/school/settings/access">Manage role boundaries <ArrowRight size={14} aria-hidden="true" /></Link></section></div></AppShell>}
