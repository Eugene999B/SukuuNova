import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../students/students-workspace.css";

async function createStudent(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const admissionNo = String(formData.get("admissionNo") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  if (!name || !admissionNo) throw new Error("Student name and admission number are required.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    if (classId) {
      const schoolClass = await tx.class.findFirst({ where: { id: classId } });
      if (!schoolClass) throw new Error("The selected class does not belong to this school.");
    }
    await tx.student.create({ data: { schoolId: session.schoolId, name, admissionNo, classId: classId || null, status: "active" } });
    await tx.auditLogSchool.create({
      data: {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "student.created",
        entityType: "Student",
        entityId: admissionNo,
        after: { name, admissionNo, classId: classId || null }
      }
    });
  });
  redirect("/school/students");
}

export default async function StudentsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true, classTeacher: { select: { name: true } }, _count: { select: { students: true } } }
      }),
      tx.student.findMany({
        orderBy: [{ name: "asc" }],
        take: 100,
        select: { id: true, name: true, admissionNo: true, status: true, class: { select: { id: true, name: true, level: true } } }
      })
    ]);
    return { school, classes, students };
  });

  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Unassigned grade";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  const unassigned = data.students.filter((student) => !student.class);
  const assignedCount = data.students.length - unassigned.length;

  return (
    <AppShell universe="school" title="Students" subtitle="Build your learner directory around real class placement, family relationships, attendance and academic workflows." active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-workspace">
        <section className="students-hero">
          <div>
            <div className="eyebrow">People · Learners</div>
            <h2>Know every learner and where they belong.</h2>
            <p>Set up grades and class groups first, then place learners into the right group. Those placements can drive attendance, teachers, assessments, fees and reports.</p>
          </div>
          <div className="hero-actions">
            <Link href="/school/classes" className="button secondary">Manage classes</Link>
            <a href="#add-student" className="button primary">+ Add student</a>
          </div>
        </section>

        <section className="student-metrics">
          <article><span>Total learners</span><strong>{data.students.length}</strong><small>Live records in this school</small></article>
          <article><span>Placed in classes</span><strong>{assignedCount}</strong><small>Students with an active group</small></article>
          <article className={unassigned.length ? "attention" : "ok"}><span>Needs class placement</span><strong>{unassigned.length}</strong><small>{unassigned.length ? "Assign before daily workflows depend on class" : "Everyone shown is placed"}</small></article>
        </section>

        <section className="class-structure-card">
          <div className="section-head">
            <div><div className="eyebrow">School structure</div><h3>Grades & class groups</h3><p>Create a grade such as <b>Grade 5</b>, then add groups such as <b>5A</b>, <b>5B</b> and <b>5C</b>.</p></div>
            <Link href="/school/classes?action=create" className="button primary">+ Create class</Link>
          </div>
          {data.classes.length === 0 ? (
            <div className="structure-empty">
              <div className="empty-icon">◎</div>
              <strong>Your school structure starts here.</strong>
              <p>Create your first grade and class group before adding a large number of learners. For example: Grade 5 → 5A, 5B.</p>
              <Link href="/school/classes?action=create" className="text-link">Create Grade 5 →</Link>
            </div>
          ) : (
            <div className="grade-grid">
              {Object.entries(grouped).map(([level, sections]) => (
                <article className="grade-card" key={level}>
                  <div className="grade-title"><div><span className="grade-kicker">Grade</span><h4>{level}</h4></div><span className="grade-total">{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div>
                  <div className="section-list">
                    {sections.map((schoolClass) => (
                      <Link href={`/school/classes?class=${schoolClass.id}`} className="section-row" key={schoolClass.id}>
                        <span className="section-badge">{schoolClass.name.replace(/^Grade\s*\d+\s*/i, "").replace(/^Class\s*/i, "") || schoolClass.name.slice(0, 2)}</span>
                        <span className="section-main"><b>{schoolClass.name}</b><small>{schoolClass.classTeacher?.name ?? "No class teacher assigned"}</small></span>
                        <span className="section-count">{schoolClass._count.students}</span><span className="chevron">›</span>
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="student-register-card">
          <div className="section-head">
            <div><div className="eyebrow">Learner directory</div><h3>Students</h3><p>Search the real school records and see class placement at a glance.</p></div>
            <div className="head-links"><Link href="/school/students?view=unassigned">Needs placement ({unassigned.length})</Link><Link href="/school/students?view=active">Active students</Link></div>
          </div>
          <div className="student-toolbar"><input aria-label="Search students" placeholder="Search learner or admission number"/><select aria-label="Filter by class" defaultValue="all"><option value="all">All classes</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select><button type="button" className="button secondary">Filter</button></div>
          {data.students.length === 0 ? (
            <div className="register-empty"><strong>No students yet</strong><p>Add the first learner and place them directly into a class.</p><a href="#add-student" className="text-link">Add first student →</a></div>
          ) : (
            <div className="table-wrap"><table><thead><tr><th>Learner</th><th>Admission no.</th><th>Grade</th><th>Class group</th><th>Status</th><th></th></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><b>{student.name}</b></td><td>{student.admissionNo}</td><td>{student.class?.level ?? "—"}</td><td>{student.class?.name ?? <span className="pill warning">Needs placement</span>}</td><td><span className={`pill ${student.status === "active" ? "success" : "muted"}`}>{student.status}</span></td><td><Link className="row-link" href={`/school/students/${student.id}`}>Open →</Link></td></tr>)}</tbody></table></div>
          )}
        </section>

        <section className="student-lower-grid">
          <article className="setup-card"><div className="eyebrow">Recommended order</div><h3>Set up your school correctly</h3><ol><li><b>Academic structure</b><span>Define Grade 1–12 or your own levels.</span></li><li><b>Class groups</b><span>Create 5A, 5B, 6A, 6B and other groups.</span></li><li><b>Teachers</b><span>Assign a class teacher and later subject teachers.</span></li><li><b>Learners</b><span>Add or import students and place each one.</span></li><li><b>Connected workflows</b><span>Use classes to power attendance, timetable, gradebook and reporting.</span></li></ol></article>
          <article className="insight-card"><div className="eyebrow">Why class placement matters</div><h3>One relationship, many workflows.</h3><p>A correct class assignment should not be a decorative field. It becomes the common grouping used to open registers, assign subjects, schedule lessons, enter scores and produce class-level reports.</p><div className="insight-links"><Link href="/school/attendance">Attendance <span>→</span></Link><Link href="/school/timetable">Timetable <span>→</span></Link><Link href="/school/gradebook">Gradebook <span>→</span></Link><Link href="/school/report-cards">Report cards <span>→</span></Link></div></article>
        </section>

        <section id="add-student" className="form-card">
          <div><div className="eyebrow">Quick add</div><h3>Add a learner with class placement</h3><p>Keep this first entry lightweight; the learner profile can be expanded later.</p></div>
          <form action={createStudent} className="student-form">
            <label>Student name<input name="name" required placeholder="e.g. Ama Mensah" /></label>
            <label>Admission number<input name="admissionNo" required placeholder="e.g. SN-0001" /></label>
            <label>Class group<select name="classId" defaultValue=""><option value="">Leave unassigned</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select></label>
            <button className="button primary" type="submit">Create student</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
