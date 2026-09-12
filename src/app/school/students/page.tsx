import Link from "next/link";
import { IdCard, UserPlus } from "lucide-react";
import { StudentDirectory } from "@/components/students/StudentDirectory";
import { IdentityCardBatchActions } from "@/components/IdentityCardBatchActions";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { cachedSchoolRead } from "@/lib/school-cache";
import { hasPermission, requirePermission } from "@/lib/rbac";
import "./students-simple.css";

async function getStudentsPageData(schoolId: string) {
  return cachedSchoolRead(schoolId, "students-page-v4", () => withTenant(schoolId, async (tx) => {
    const [school, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.student.findMany({ orderBy: [{ name: "asc" }], take: 250, select: { id: true, name: true, admissionNo: true, dob: true, status: true, photoUrl: true, class: { select: { id: true, name: true, level: true } }, _count: { select: { attendanceEvents: true, reportCards: true, invoices: true } } } }),
    ]);
    return { school, classes, students };
  }), 30);
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    return getStudentsPageData(session.schoolId);
  });
  const canManageCards = await withTenant(session.schoolId, (tx) => hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false));
  const canAdmit = await withTenant(session.schoolId, (tx) => hasPermission(tx, session.userId, "students:write").catch(() => false));
  const unassigned = data.students.filter((student) => !student.class);
  const assignedCount = data.students.length - unassigned.length;
  const activeCount = data.students.filter((student) => student.status === "active").length;
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Other / ungraded";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  const cardClasses = data.classes.map((schoolClass) => ({ id: schoolClass.id, name: `${schoolClass.level ?? ""} ${schoolClass.name}`.trim() }));

  return (
    <AppShell universe="school" title="Students" subtitle="Official learner register — admitted and enrolled students only." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-simple">
        <section className="students-simple-head">
          <div><h2>Student register</h2><p>Search official learners here. New learners enter through Admissions before they become part of this register.</p></div>
          <div className="students-simple-actions"><Link href="/school/id-cards" className="button secondary"><IdCard size={15} aria-hidden="true" /> ID cards</Link>{canAdmit ? <Link href="/school/admissions/applications/new" className="button primary"><UserPlus size={15} aria-hidden="true" /> New admission</Link> : null}</div>
        </section>
        {canManageCards ? <section className="students-simple-section"><div className="students-simple-section-head"><div><h3>Student identity cards</h3><p>Download the whole student body or choose one class for an A4 print pack. Every card includes the school brand and signed verification QR.</p></div></div><IdentityCardBatchActions mode="students" classes={cardClasses}/></section> : null}
        <section className="students-simple-stats" aria-label="Student register summary"><div className="students-simple-stat"><span>Active learners</span><strong>{activeCount}</strong></div><div className="students-simple-stat"><span>In a class</span><strong>{assignedCount}</strong></div><div className="students-simple-stat"><span>Needs placement</span><strong>{unassigned.length}</strong></div></section>
        <section className="students-simple-section"><div className="students-simple-section-head"><div><h3>Learners</h3><p>Search by name or index number, then narrow by class or status.</p></div></div><StudentDirectory students={data.students} classes={data.classes} initialClassId={params.classId} /></section>
        <details className="sn-progressive"><summary>Classes and placement</summary><div className="sn-progressive-body">{data.classes.length ? <div className="students-class-grid">{Object.entries(grouped).map(([level, sections]) => <div className="students-class-card" key={level}><div className="students-class-card-head"><strong>{level}</strong><span>{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="students-class-links">{sections.map((schoolClass) => <Link href={`/school/students?classId=${schoolClass.id}`} key={schoolClass.id}><span>{schoolClass.name}</span><strong>{schoolClass._count.students} →</strong></Link>)}</div></div>)}</div> : <div className="student-directory-empty"><strong>No classes created yet.</strong><span>Create the academic class structure before placing learners.</span></div>}</div></details>
        <details className="sn-progressive"><summary>More student administration</summary><div className="sn-progressive-body students-tools"><Link href="/school/admissions/applications"><strong>Admissions & enrolment</strong><span>Applications and admission history →</span></Link><Link href="/school/classes"><strong>Classes & houses</strong><span>Manage class structure →</span></Link><Link href="/school/guardians"><strong>Guardians</strong><span>Review family links →</span></Link><Link href="/school/id-cards"><strong>School ID cards</strong><span>Issue and print credentials →</span></Link></div></details>
      </div>
    </AppShell>
  );
}
