import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenCheck, ClipboardCheck, FileText, Settings2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cacheTenantRead } from "@/lib/server-cache";
import "./gradebook-simple.css";

async function getGradebookSummary(schoolId: string, userId: string, canModerate: boolean) {
  const cached = cacheTenantRead(
    ["gradebook-summary", schoolId, userId, canModerate ? "moderate" : "assigned"],
    async () => withTenant(schoolId, async (tx) => {
      const [assignments, assessmentCount, studentCount, termCount] = await Promise.all([
        tx.classSubjectTeacher.count({ where: canModerate ? {} : { teacherId: userId } }),
        tx.assessment.count({ where: { schoolId } }),
        tx.student.count({ where: { schoolId, status: "active" } }),
        tx.term.count({ where: { schoolId } }),
      ]);
      return { assignments, assessmentCount, studentCount, termCount };
    }),
    30,
    [`gradebook:${schoolId}`],
  );
  return cached();
}

export default async function GradebookPage() {
  const session = await requireSchoolSession();
  const permissions = await withTenant(session.schoolId, async (tx) => {
    const canWrite = await hasPermission(tx, session.userId, "scores:write:assigned");
    const canModerate = await hasPermission(tx, session.userId, "scores:write:all");
    if (!canWrite && !canModerate) await requirePermission(tx, session.userId, "report_cards:view");
    return { canWrite, canModerate };
  });
  const data = { ...permissions, ...await getGradebookSummary(session.schoolId, session.userId, permissions.canModerate) };
  const canEnterMarks = data.canWrite || data.canModerate;

  return (
    <AppShell universe="school" title="Gradebook" subtitle="Enter marks, review results and prepare reports." active="Gradebook" userName={session.name}>
      <div className="gb-simple">
        <section className="gb-context" aria-label="Gradebook access">
          <div className="gb-context-copy">
            <strong>{canEnterMarks ? "Ready for mark entry" : "Results view"}</strong>
            <span>{data.canModerate ? "You can review results across the school." : canEnterMarks ? "You can work with your assigned classes and subjects." : "You have read-only reporting access."}</span>
          </div>
          <span className="gb-role">{data.canModerate ? "School-wide" : canEnterMarks ? "Assigned classes" : "View only"}</span>
        </section>

        <section className="gb-start">
          <div className="gb-section-head">
            <div>
              <h2>What do you want to do?</h2>
              <p>Choose one task. The rest of the gradebook stays out of the way.</p>
            </div>
          </div>

          <div className="gb-actions">
            {canEnterMarks ? (
              <Link className="gb-action is-primary" href="/school/gradebook/studio">
                <span className="gb-action-icon"><ClipboardCheck size={19} aria-hidden="true" /></span>
                <strong>Enter or edit marks</strong>
                <p>Select a class, subject and assessment, then work directly in the mark sheet.</p>
                <span className="gb-action-go">Open mark sheet <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            ) : (
              <Link className="gb-action is-primary" href="/school/report-cards">
                <span className="gb-action-icon"><FileText size={19} aria-hidden="true" /></span>
                <strong>View report cards</strong>
                <p>Open prepared learner results without entering the mark-entry workspace.</p>
                <span className="gb-action-go">Open report cards <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            )}

            {canEnterMarks ? (
              <Link className="gb-action" href="/school/teacher-academic">
                <span className="gb-action-icon"><BookOpenCheck size={19} aria-hidden="true" /></span>
                <strong>Teaching work</strong>
                <p>Open weekly activities, class work and the teacher academic workflow.</p>
                <span className="gb-action-go">Open teaching work <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            ) : (
              <Link className="gb-action" href="/school/terms">
                <span className="gb-action-icon"><Settings2 size={19} aria-hidden="true" /></span>
                <strong>Academic periods</strong>
                <p>See the terms and academic periods that organise result records.</p>
                <span className="gb-action-go">View terms <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            )}

            <Link className="gb-action" href={data.canModerate ? "/school/academics/performance" : "/school/report-cards"}>
              <span className="gb-action-icon">{data.canModerate ? <BarChart3 size={19} aria-hidden="true" /> : <FileText size={19} aria-hidden="true" />}</span>
              <strong>{data.canModerate ? "Review performance" : "Prepare reports"}</strong>
              <p>{data.canModerate ? "Check the wider result picture after marks have been entered." : "Move from completed results to learner report cards."}</p>
              <span className="gb-action-go">{data.canModerate ? "Open performance" : "Open report cards"} <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          </div>
        </section>

        <section className="gb-stats" aria-label="Gradebook summary">
          <div className="gb-stat"><span>{data.canModerate ? "Teaching links" : "My teaching links"}</span><strong>{data.assignments}</strong></div>
          <div className="gb-stat"><span>Assessments</span><strong>{data.assessmentCount}</strong></div>
          <div className="gb-stat"><span>Active learners</span><strong>{data.studentCount}</strong></div>
          <div className="gb-stat"><span>Academic terms</span><strong>{data.termCount}</strong></div>
        </section>

        <section className="gb-secondary" aria-label="More gradebook options">
          <details className="sn-progressive">
            <summary>How the gradebook workflow works</summary>
            <div className="sn-progressive-body">
              <div className="gb-flow">
                <div className="gb-flow-step"><b>1. Enter</b><span>Choose the class and assessment, then record marks.</span></div>
                <div className="gb-flow-step"><b>2. Review</b><span>Check completeness and performance before reporting.</span></div>
                <div className="gb-flow-step"><b>3. Report</b><span>Use approved results in report cards and school reporting.</span></div>
              </div>
            </div>
          </details>

          <details className="sn-progressive">
            <summary>More tools and setup</summary>
            <div className="sn-progressive-body">
              <div className="gb-tool-list">
                {data.canModerate ? <Link className="gb-tool-link" href="/school/academics/performance"><b>Performance</b><span>Analyse results →</span></Link> : null}
                <Link className="gb-tool-link" href="/school/report-cards"><b>Report cards</b><span>Prepare reports →</span></Link>
                <Link className="gb-tool-link" href="/school/exams"><b>Assessments</b><span>Manage exams →</span></Link>
                <Link className="gb-tool-link" href="/school/academics/setup"><b>Academic setup</b><span>Subjects & rules →</span></Link>
                <Link className="gb-tool-link" href="/school/terms"><b>Terms & calendar</b><span>Academic periods →</span></Link>
                {data.canModerate ? <Link className="gb-tool-link" href="/school/settings/access"><b>Access</b><span>Roles & permissions →</span></Link> : null}
              </div>
            </div>
          </details>
        </section>
      </div>
    </AppShell>
  );
}
