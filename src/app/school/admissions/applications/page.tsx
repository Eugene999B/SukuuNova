import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { ADMISSION_STATUSES, admissionStatusLabel, isAdmissionStatus, type AdmissionApplicationRow } from "@/lib/admissions-v2";
import "./admissions-v2.css";

type ListRow = Pick<AdmissionApplicationRow, "id" | "reference" | "studentName" | "guardianName" | "guardianPhone" | "intendedClassName" | "status" | "createdAt" | "updatedAt" | "convertedStudentId">;

export default async function AdmissionsApplicationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const q = String(params.q ?? "").trim().toLowerCase();
  const requestedStatus = String(params.status ?? "");
  const status = isAdmissionStatus(requestedStatus) ? requestedStatus : "";

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, rows] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.$queryRawUnsafe<ListRow[]>(`SELECT "id","reference","studentName","guardianName","guardianPhone","intendedClassName","status","createdAt","updatedAt","convertedStudentId" FROM "AdmissionApplication" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT 500`, session.schoolId),
    ]);
    return { school, rows };
  });

  const counts = Object.fromEntries(ADMISSION_STATUSES.map((item) => [item, data.rows.filter((row) => row.status === item).length]));
  const filtered = data.rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (!q) return true;
    return [row.studentName, row.guardianName, row.guardianPhone, row.reference, row.intendedClassName ?? ""].some((value) => value.toLowerCase().includes(q));
  });
  const active = data.rows.filter((row) => !["declined", "enrolled"].includes(row.status)).length;

  return (
    <AppShell universe="school" title="Admissions & Enrolment" subtitle="Applications, offers, acceptance and permanent admission history." active="Applications" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="admissions-v2">
        <section className="admissions-hero">
          <div><span className="admissions-kicker">Official admissions</span><h2>One controlled path into the Student register.</h2><p>Prospective families can begin as enquiries. A submitted application is reviewed, offered and accepted here; only the final enrolment step creates the official student record.</p></div>
          <div className="admissions-actions"><Link className="button secondary" href="/school/admissions/enquiries">Enquiries</Link><Link className="button primary" href="/school/admissions/applications/new">+ New admission</Link></div>
        </section>

        <section className="admissions-kpis" aria-label="Admission summary">
          <div className="admissions-kpi"><span>Active pipeline</span><strong>{active}</strong></div>
          <div className="admissions-kpi"><span>Submitted</span><strong>{counts.submitted ?? 0}</strong></div>
          <div className="admissions-kpi"><span>Review</span><strong>{counts.under_review ?? 0}</strong></div>
          <div className="admissions-kpi"><span>Offers</span><strong>{counts.offered ?? 0}</strong></div>
          <div className="admissions-kpi"><span>Accepted</span><strong>{counts.accepted ?? 0}</strong></div>
          <div className="admissions-kpi"><span>Enrolled</span><strong>{counts.enrolled ?? 0}</strong></div>
        </section>

        <section className="admissions-card">
          <div className="admissions-card-head"><div><span className="admissions-kicker">Admission history</span><h3>Applications register</h3><p>{filtered.length} record{filtered.length === 1 ? "" : "s"} in this view. Enrolled and declined records remain here for historical reference.</p></div></div>
          <nav className="admissions-tabs" aria-label="Application status filters">
            <Link className={!status ? "active" : ""} href="/school/admissions/applications">All · {data.rows.length}</Link>
            {ADMISSION_STATUSES.map((item) => <Link key={item} className={status === item ? "active" : ""} href={`/school/admissions/applications?status=${item}`}>{admissionStatusLabel(item)} · {counts[item] ?? 0}</Link>)}
          </nav>
          <form className="admissions-search" action="/school/admissions/applications" method="get">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search learner, guardian, phone, application no. or class" />
            <button className="button secondary" type="submit">Search</button>
          </form>
          {filtered.length ? <div className="admissions-list">{filtered.map((row) => (
            <article className="admissions-row" key={row.id}>
              <div className="mobile-full"><span className="admissions-ref">{row.reference}</span><h4>{row.studentName}</h4><p>{row.guardianName} · {row.guardianPhone}</p></div>
              <div><span className="admission-status" data-status={row.status}>{admissionStatusLabel(row.status)}</span><p>{row.intendedClassName ?? "Placement pending"}</p></div>
              <div className="hide-tablet"><strong>{new Date(row.createdAt).toLocaleDateString("en-GH")}</strong><small>Last updated {new Date(row.updatedAt).toLocaleDateString("en-GH")}</small></div>
              <Link className="button secondary" href={`/school/admissions/applications/${row.id}`}>Open →</Link>
            </article>
          ))}</div> : <div className="admissions-empty"><strong>No applications found.</strong><p>Start a new admission or change the filters.</p></div>}
        </section>
      </div>
    </AppShell>
  );
}
