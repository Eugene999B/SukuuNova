import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DetailGrid, ProductEmpty, ProductPageHeader, ProductSection } from "@/components/product/ProductWorkspace";
import "@/components/product/product-workspace.css";

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, subject] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.subject.findFirst({
        where: { id, schoolId: session.schoolId },
        select: {
          id: true,
          name: true,
          teacherAssignments: { select: { class: { select: { id: true, name: true, level: true } }, teacher: { select: { id: true, name: true } } } },
          assessments: { orderBy: { name: "asc" }, take: 20, select: { id: true, name: true, type: true, weight: true, maxScore: true, class: { select: { name: true } }, term: { select: { name: true } } } },
          _count: { select: { teacherAssignments: true, assessments: true, scores: true, timetableSlots: true } },
        },
      }),
    ]);
    return { school, subject };
  });
  if (!data.school) notFound();
  if (!data.subject) {
    return (
      <AppShell universe="school" title="Subject not found" subtitle="Subjects workspace." active="Subjects" schoolName="School Workspace" schoolCode="" userName={session.name}>
        <div className="product-workspace">
          <ProductPageHeader eyebrow="Subjects" title="Subject not found" description="This subject does not exist in your school." backHref="/school/subjects" backLabel="Subjects" />
        </div>
      </AppShell>
    );
  }
  const s = data.subject;
  const classes = [...new Map(s.teacherAssignments.map((a) => [a.class.id, a.class])).values()];
  const teachers = [...new Map(s.teacherAssignments.map((a) => [a.teacher.id, a.teacher])).values()];
  return (
    <AppShell universe="school" title={s.name} subtitle="Subject workspace — where it is taught, by whom, and how it is assessed." active="Subjects" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow="Subject workspace"
          title={s.name}
          description={`${classes.length} classes · ${teachers.length} teachers · ${s._count.assessments} assessments`}
          backHref="/school/subjects"
          backLabel="Subjects"
          stats={[
            { label: "Classes", value: String(classes.length) },
            { label: "Teachers", value: String(teachers.length) },
            { label: "Assessments", value: String(s._count.assessments) },
            { label: "Scores", value: String(s._count.scores) },
          ]}
          actions={<Link className="button primary" href="/school/gradebook/studio">Open gradebook</Link>}
          tabs={[
            { label: "Overview", href: `/school/subjects/${s.id}`, active: true },
            { label: "Assessments", href: "/school/exams" },
            { label: "Timetable", href: "/school/timetable" },
          ]}
        />
        <ProductSection eyebrow="Teaching" title="Classes & teachers" description="Every class-teacher assignment for this subject. Manage from Subjects.">
          {s.teacherAssignments.length === 0 ? (
            <ProductEmpty title="Not assigned yet" description="Assign this subject to classes and teachers so lessons, timetable and results connect." />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {s.teacherAssignments.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <Link href={`/school/classes/${a.class.id}`}>{a.class.level ? `${a.class.level} · ` : ""}{a.class.name}</Link>
                      </td>
                      <td>{a.teacher.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
        <ProductSection eyebrow="Assessment" title="Assessments & results" description="What has been set, how it is weighted, and where marks live.">
          <DetailGrid items={[{ label: "Timetable slots", value: String(s._count.timetableSlots) }, { label: "Scores recorded", value: String(s._count.scores) }]} />
          {s.assessments.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <ProductEmpty title="No assessments" description="Create assessments from Exams so teachers can enter marks against this subject." />
            </div>
          ) : (
            <div className="product-table-wrap" style={{ marginTop: 12 }}>
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Assessment</th>
                    <th scope="col">Class</th>
                    <th scope="col">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {s.assessments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.name} <small style={{ color: "var(--color-text-muted)" }}>· {a.type} · /{String(a.maxScore)}</small>
                      </td>
                      <td>{a.class.name}</td>
                      <td>{String(a.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
      </div>
    </AppShell>
  );
}
