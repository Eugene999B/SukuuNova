import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./applications.css";

const stages = ["Draft", "Submitted", "Review", "Accepted", "Rejected"] as const;

type Application = {
  id: string;
  reference: string;
  applicant: string;
  guardian: string;
  className: string;
  submittedAt: Date | null;
  status: string;
  completeness: number;
};

export default async function ApplicationsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, enquiries, students, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.$queryRaw<Array<{ id:string; reference:string; studentName:string; guardianName:string|null; intendedClass:string|null; stage:string; createdAt:Date; updatedAt:Date }>>`
        SELECT "id","reference","studentName","guardianName","intendedClass","stage","createdAt","updatedAt"
        FROM "AdmissionEnquiry"
        WHERE "schoolId"=${session.schoolId}
          AND "stage" IN ('applied','accepted','rejected')
        ORDER BY "createdAt" DESC
        LIMIT 100
      `,
      tx.student.count({ where: { schoolId: session.schoolId, status: "active" } }),
      tx.class.count({ where: { schoolId: session.schoolId } }),
    ]);

    const applicationRows: Application[] = enquiries.map((item) => ({
      id: item.id,
      reference: item.reference,
      applicant: item.studentName,
      guardian: item.guardianName ?? "Not recorded",
      className: item.intendedClass ?? "Not selected",
      submittedAt: item.updatedAt,
      status: item.stage === "applied" ? "Submitted" : item.stage === "accepted" ? "Accepted" : "Rejected",
      completeness: item.stage === "accepted" || item.stage === "rejected" ? 100 : 70,
    }));
    return { school, applications: applicationRows, enquiries: enquiries.length, students, classes };
  });

  const counts = {
    draft: data.applications.filter((a) => a.status === "Draft").length,
    submitted: data.applications.filter((a) => a.status === "Submitted").length,
    review: data.applications.filter((a) => a.status === "Submitted").length,
    accepted: data.applications.filter((a) => a.status === "Accepted").length,
    rejected: data.applications.filter((a) => a.status === "Rejected").length,
  };
  const completion = data.applications.length ? Math.round(data.applications.reduce((sum, item) => sum + item.completeness, 0) / data.applications.length) : 0;

  return (
    <AppShell universe="school" title="Applications" subtitle="Review submitted applications, make admission decisions and move accepted learners into enrolment." active="Applications" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="applications-page">
        <section className="applications-hero">
          <div>
            <span className="applications-eyebrow">Admissions · Applications</span>
            <h2>Move promising applicants forward.</h2>
            <p>Review applications, check completeness, make decisions and hand accepted learners into enrolment without losing the admissions trail.</p>
          </div>
          <div className="applications-hero-actions">
            <Link href="/school/admissions/enquiries" className="app-button secondary">View enquiries</Link>
            <Link href="/school/admissions/applications?action=new" className="app-button primary">+ New application</Link>
          </div>
        </section>

        <section className="application-kpis">
          <article className="application-kpi accent"><span>Applications</span><strong>{data.applications.length}</strong><small>Current admissions workload</small></article>
          <article className="application-kpi"><span>Submitted</span><strong>{counts.submitted}</strong><small>Ready for review</small></article>
          <article className="application-kpi"><span>Accepted</span><strong>{counts.accepted}</strong><small>Ready for enrolment</small></article>
          <article className="application-kpi"><span>Average complete</span><strong>{completion}%</strong><small>Application completeness</small></article>
        </section>

        <section className="application-pipeline">
          <div className="application-section-head"><div><span className="applications-eyebrow">Decision pipeline</span><h3>Application stages</h3></div><Link href="/school/admissions/enrolment" className="application-inline-link">Open enrolment →</Link></div>
          <div className="pipeline-grid">
            {stages.map((stage) => {
              const value = stage === "Draft" ? counts.draft : stage === "Submitted" ? counts.submitted : stage === "Review" ? counts.review : stage === "Accepted" ? counts.accepted : counts.rejected;
              return <Link className={`pipeline-stage stage-${stage.toLowerCase()}`} href={`/school/admissions/applications?view=${encodeURIComponent(stage)}`} key={stage}><span>{stage}</span><strong>{value}</strong><small>{stage === "Review" ? "Needs a decision" : stage === "Accepted" ? "Ready to enrol" : stage === "Rejected" ? "Closed" : "In this stage"}</small></Link>;
            })}
          </div>
        </section>

        <section className="applications-main-grid">
          <div className="applications-register">
            <div className="application-section-head"><div><span className="applications-eyebrow">Application register</span><h3>Recent applications</h3><p>Search, filter and open the complete application record.</p></div><div className="application-head-actions"><Link href="/school/admissions/applications?view=Submitted">Needs review</Link><Link href="/school/admissions/applications?view=Accepted">Accepted</Link></div></div>
            <form className="application-toolbar" action="/school/admissions/applications" method="get"><input name="q" placeholder="Search applicant, guardian or reference"/><select name="status" defaultValue="all"><option value="all">All stages</option>{stages.map((stage) => <option value={stage} key={stage}>{stage}</option>)}</select><select name="class" defaultValue="all"><option value="all">All classes</option></select><button className="app-button secondary" type="submit">Filter</button></form>
            {data.applications.length ? <div className="applications-table-wrap"><table className="applications-table"><thead><tr><th>Applicant</th><th>Applying for</th><th>Completeness</th><th>Status</th><th /></tr></thead><tbody>{data.applications.map((application) => <tr key={application.id}><td><div className="applicant-cell"><span className="applicant-avatar">{application.applicant.slice(0, 2).toUpperCase()}</span><div><strong>{application.applicant}</strong><span>{application.reference} · {application.guardian}</span></div></div></td><td>{application.className}</td><td><div className="completion-cell"><div><span>{application.completeness}%</span></div><i><em style={{ width: `${application.completeness}%` }} /></i></div></td><td><span className={`application-status ${application.status.toLowerCase()}`}>{application.status}</span></td><td><Link href={`/school/admissions/applications/${application.id}`} className="application-open">Open →</Link></td></tr>)}</tbody></table></div> : <div className="applications-empty"><span className="empty-orb">◎</span><strong>No applications yet</strong><p>Accepted or submitted enquiries will appear here when they enter the application stage.</p><Link href="/school/admissions/enquiries" className="app-button primary">Open admissions enquiries</Link></div>}
          </div>

          <aside className="application-side">
            <div className="application-side-card priority"><span className="applications-eyebrow">Admissions health</span><h3>Keep decisions moving.</h3><div className="side-stat"><strong>{counts.submitted}</strong><span>submitted applications awaiting review</span></div><div className="side-stat"><strong>{counts.accepted}</strong><span>accepted applicants ready for enrolment</span></div><Link href="/school/admissions/applications?view=Submitted" className="side-action">Start reviewing →</Link></div>
            <div className="application-side-card"><span className="applications-eyebrow">Connected records</span><div className="connected-stat"><strong>{data.enquiries}</strong><span>current application enquiries</span></div><div className="connected-stat"><strong>{data.students}</strong><span>active learners already enrolled</span></div><div className="connected-stat"><strong>{data.classes}</strong><span>classes available for placement</span></div></div>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
