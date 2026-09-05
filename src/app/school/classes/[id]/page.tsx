import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, BookOpenCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DetailGrid, ProductEmpty, ProductPageHeader, ProductSection, StatusBadge } from "@/components/product/ProductWorkspace";
import "@/components/product/product-workspace.css";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, klass] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findFirst({
        where: { id, schoolId: session.schoolId },
        select: {
          id: true,
          name: true,
          level: true,
          classTeacher: { select: { id: true, name: true } },
          students: { orderBy: { name: "asc" }, take: 50, select: { id: true, name: true, admissionNo: true, status: true } },
          subjectAssignments: { select: { subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } } },
          timetableSlots: { orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], take: 20, select: { dayOfWeek: true, period: true, subject: { select: { name: true } }, teacher: { select: { name: true } } } },
          _count: { select: { students: true, subjectAssignments: true, timetableSlots: true } },
        },
      }),
    ]);
    if (!klass) return { school, klass: null, attendance: [] as Array<{ type: string; count: number }> };
    const attendance = await tx.attendanceEvent.groupBy({ by: ["type"], where: { schoolId: session.schoolId, student: { classId: klass.id } }, _count: { _all: true } });
    return { school, klass, attendance: attendance.map((r) => ({ type: r.type, count: r._count._all })) };
  });
  if (!data.school) notFound();
  if (!data.klass) {
    return (
      <AppShell universe="school" title="Class not found" subtitle="Classes workspace." active="Classes & Houses" schoolName="School Workspace" schoolCode="" userName={session.name}>
        <div className="product-workspace">
          <ProductPageHeader eyebrow="Classes" title="Class not found" description="This class does not exist in your school or was removed." backHref="/school/classes" backLabel="Classes" />
        </div>
      </AppShell>
    );
  }
  const k = data.klass;
  return (
    <AppShell universe="school" title={`${k.level ? `${k.level} · ` : ""}${k.name}`} subtitle="Class workspace — roster, teaching, timetable and attendance." active="Classes & Houses" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow={`Class · ${k.level ?? "Ungraded"}`}
          title={k.name}
          description={k.classTeacher ? `Led by ${k.classTeacher.name} · ${k._count.students} learners · ${k._count.subjectAssignments} subject assignments` : `No class teacher yet · ${k._count.students} learners`}
          backHref="/school/classes"
          backLabel="Classes"
          stats={[
            { label: "Learners", value: String(k._count.students) },
            { label: "Subjects", value: String(k._count.subjectAssignments) },
            { label: "Timetable slots", value: String(k._count.timetableSlots) },
          ]}
          actions={
            <>
              <Link className="button secondary" href={`/school/students?classId=${k.id}`}>
                <UsersRound size={15} aria-hidden="true" /> Roster
              </Link>
              <Link className="button secondary" href="/school/attendance/register">
                <CalendarCheck2 size={15} aria-hidden="true" /> Attendance
              </Link>
              <Link className="button primary" href="/school/gradebook/studio">
                <BookOpenCheck size={15} aria-hidden="true" /> Gradebook
              </Link>
            </>
          }
          tabs={[
            { label: "Overview", href: `/school/classes/${k.id}`, active: true },
            { label: "Learners", href: `/school/students?classId=${k.id}`, count: k._count.students },
            { label: "Timetable", href: "/school/timetable" },
          ]}
        />
        <ProductSection eyebrow="Identity" title="Class identity" description="How this group is referenced across the school.">
          <DetailGrid
            items={[
              { label: "Name", value: k.name },
              { label: "Level", value: k.level ?? "—" },
              { label: "Form teacher", value: k.classTeacher?.name ?? "Unassigned", hint: k.classTeacher ? undefined : "Assign from Classes workspace" },
            ]}
          />
        </ProductSection>
        <ProductSection eyebrow="Teaching" title={`Subjects (${k.subjectAssignments.length})`} description="Which subjects are taught here and by whom.">
          {k.subjectAssignments.length === 0 ? (
            <ProductEmpty title="No subjects assigned" description="Assign subjects to this class from Subjects so timetable and gradebook unlock." action={<Link className="button secondary" href="/school/subjects">Open subjects</Link>} />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {k.subjectAssignments.map((a, i) => (
                    <tr key={`${a.subject.id}-${i}`}>
                      <td>
                        <Link href={`/school/subjects/${a.subject.id}`}>{a.subject.name}</Link>
                      </td>
                      <td>{a.teacher.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
        <ProductSection eyebrow="Timetable" title="Weekly slots" description="First 20 slots. Full editing lives in the timetable workspace.">
          {k.timetableSlots.length === 0 ? (
            <ProductEmpty title="No timetable yet" description="Build the weekly grid so teachers and learners know where to be." action={<Link className="button secondary" href="/school/timetable">Open timetable</Link>} />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Period</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {k.timetableSlots.map((s, i) => (
                    <tr key={i}>
                      <td>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.dayOfWeek] ?? s.dayOfWeek}</td>
                      <td>{s.period}</td>
                      <td>{s.subject.name}</td>
                      <td>{s.teacher.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
        <ProductSection eyebrow="People" title={`Learners (${k._count.students})`} description="First 50 alphabetically. Full roster with search lives in Students.">
          {k.students.length === 0 ? (
            <ProductEmpty title="No learners placed" description="Place learners from the student register to activate class workflows." />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Index</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {k.students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/school/students/${s.id}`}>{s.name}</Link>
                      </td>
                      <td>{s.admissionNo}</td>
                      <td>
                        <StatusBadge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
        <ProductSection eyebrow="Attendance" title="Summary" description="Check-in mix for learners currently in this class.">
          {data.attendance.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No attendance recorded for this class yet.</p>
          ) : (
            <DetailGrid items={data.attendance.map((a) => ({ label: a.type, value: String(a.count) }))} />
          )}
        </ProductSection>
      </div>
    </AppShell>
  );
}
