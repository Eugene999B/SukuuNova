import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, BookOpenCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { isTeachingAccount } from "@/lib/authorization";
import { listClassSubjectOfferings } from "@/lib/class-subject-offerings";
import { DetailGrid, ProductEmpty, ProductPageHeader, ProductSection, StatusBadge } from "@/components/product/ProductWorkspace";
import { ClassCurriculumManager } from "./ClassCurriculumManager";
import { ClassCategoryManager } from "./ClassCategoryManager";
import "@/components/product/product-workspace.css";

type CurrentSectionRow = {
  gradeLevelId: string;
  sectionCode: string;
  displayName: string;
  gradeName: string;
};

type CategoryRow = { classId: string; sectionCode: string; displayName: string };

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, klass, subjects, teacherCandidates, canManage] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findFirst({
        where: { id, schoolId: session.schoolId },
        select: {
          id: true,
          name: true,
          level: true,
          classTeacher: { select: { id: true, name: true } },
          students: { orderBy: { name: "asc" }, take: 50, select: { id: true, name: true, admissionNo: true, status: true } },
          timetableSlots: { orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], take: 20, select: { dayOfWeek: true, period: true, subject: { select: { name: true } }, teacher: { select: { name: true } } } },
          _count: { select: { students: true, timetableSlots: true } },
        },
      }),
      tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.user.findMany({
        where: { schoolId: session.schoolId, status: "active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } },
      }),
      hasPermission(tx, session.userId, "classes:manage", session.schoolId),
    ]);
    if (!klass) return { school, klass: null, attendance: [] as Array<{ type: string; count: number }>, subjects, teachers: [], offerings: [], canManage, categoryContext: null };

    const [offerings, attendance, currentYear] = await Promise.all([
      listClassSubjectOfferings(tx, session.schoolId, klass.id),
      tx.attendanceEvent.groupBy({ by: ["type"], where: { schoolId: session.schoolId, student: { classId: klass.id } }, _count: { _all: true } }),
      tx.academicYear.findFirst({ where: { schoolId: session.schoolId, isLocked: false }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    ]);

    let categoryContext: {
      academicYearName: string | null;
      displayName: string;
      levelName: string;
      categories: Array<{ classId: string; code: string; displayName: string }>;
    } = {
      academicYearName: currentYear?.name ?? null,
      displayName: klass.name,
      levelName: klass.level ?? klass.name,
      categories: [],
    };

    if (currentYear) {
      const currentSections = await tx.$queryRawUnsafe<CurrentSectionRow[]>(
        `SELECT cs."gradeLevelId",cs."sectionCode",cs."displayName",g."name" AS "gradeName"
           FROM "ClassSection" cs
           JOIN "GradeLevel" g ON g."id"=cs."gradeLevelId" AND g."schoolId"=cs."schoolId"
          WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."classId"=$3 AND cs."isActive"=true
          LIMIT 1`,
        session.schoolId,
        currentYear.id,
        klass.id,
      );
      const currentSection = currentSections[0];
      if (currentSection) {
        const categories = await tx.$queryRawUnsafe<CategoryRow[]>(
          `SELECT "classId","sectionCode","displayName" FROM "ClassSection"
            WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "gradeLevelId"=$3 AND "isActive"=true
            ORDER BY "displayName"`,
          session.schoolId,
          currentYear.id,
          currentSection.gradeLevelId,
        );
        categoryContext = {
          academicYearName: currentYear.name,
          displayName: currentSection.displayName,
          levelName: currentSection.gradeName,
          categories: categories.map((item) => ({ classId: item.classId, code: item.sectionCode, displayName: item.displayName })),
        };
      }
    }

    const teachers = teacherCandidates
      .filter((user) => isTeachingAccount(user.userRoles.map(({ role }) => role)))
      .map(({ userRoles: _roles, ...user }) => user);
    return { school, klass, attendance: attendance.map((r) => ({ type: r.type, count: r._count._all })), subjects, teachers, offerings, canManage, categoryContext };
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
  const displayName = data.categoryContext?.displayName ?? k.name;
  const levelName = data.categoryContext?.levelName ?? k.level ?? k.name;
  return (
    <AppShell universe="school" title={displayName} subtitle="Class workspace — roster, subjects, teachers, timetable and attendance." active="Classes & Houses" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow={`Class · ${levelName}`}
          title={displayName}
          description={k.classTeacher ? `Led by ${k.classTeacher.name} · ${k._count.students} learners · ${data.offerings.length} subjects` : `No class teacher yet · ${k._count.students} learners · ${data.offerings.length} subjects`}
          backHref="/school/classes"
          backLabel="Classes"
          stats={[
            { label: "Learners", value: String(k._count.students) },
            { label: "Subjects", value: String(data.offerings.length) },
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
            { label: "Subjects & Teachers", href: "#subjects", count: data.offerings.length },
            { label: "Timetable", href: "/school/timetable" },
          ]}
        />
        <ProductSection eyebrow="Identity" title="Class identity" description="The installed academic template supplies this official class level.">
          <DetailGrid
            items={[
              { label: "Class", value: displayName },
              { label: "Official level", value: levelName },
              { label: "Form teacher", value: k.classTeacher?.name ?? "Unassigned", hint: k.classTeacher ? undefined : "Assign from Classes workspace" },
            ]}
          />
        </ProductSection>
        <ProductSection eyebrow="Categories" title="Split this class only when needed" description={`Keep ${levelName} as one class, or split it into categories such as A and B. Categories are managed here, not in Academic Settings.`}>
          <ClassCategoryManager
            classId={k.id}
            levelName={levelName}
            academicYearName={data.categoryContext?.academicYearName ?? null}
            categories={data.categoryContext?.categories ?? []}
            canManage={data.canManage}
          />
        </ProductSection>
        <div id="subjects">
          <ProductSection eyebrow="Curriculum" title={`Subjects & teachers (${data.offerings.length})`} description="Choose what this class learns first, then assign one or more teachers to each subject.">
            <ClassCurriculumManager classId={k.id} offerings={data.offerings} subjects={data.subjects} teachers={data.teachers} canManage={data.canManage} />
          </ProductSection>
        </div>
        <ProductSection eyebrow="Timetable" title="Weekly slots" description="First 20 slots. Full editing lives in the timetable workspace.">
          {k.timetableSlots.length === 0 ? (
            <ProductEmpty title="No timetable yet" description="Build the weekly grid after subjects and teachers are ready." action={<Link className="button secondary" href="/school/timetable">Open timetable</Link>} />
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
