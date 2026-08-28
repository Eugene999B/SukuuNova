import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../students/students-workspace.css";

async function createClass(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const level = String(formData.get("level") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const classTeacherId = String(formData.get("classTeacherId") ?? "").trim();
  if (!level || !name) throw new Error("Grade level and class group name are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    if (classTeacherId) {
      const teacher = await tx.user.findFirst({ where: { id: classTeacherId }, select: { id: true } });
      if (!teacher) throw new Error("The selected class teacher does not belong to this school.");
    }
    const schoolClass = await tx.class.create({ data: { schoolId: session.schoolId, level, name, classTeacherId: classTeacherId || null } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "class.created", entityType: "Class", entityId: schoolClass.id, after: { level, name, classTeacherId: classTeacherId || null } } });
  });
  redirect("/school/classes");
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ class?: string; action?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, teachers] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, classTeacher: { select: { id: true, name: true } }, _count: { select: { students: true, subjectAssignments: true, timetableSlots: true } } } }),
      tx.user.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    ]);
    return { school, classes, teachers };
  });

  const selected = data.classes.find((item) => item.id === params.class);
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc, item) => {
    const level = item.level?.trim() || "Unassigned grade";
    (acc[level] ??= []).push(item);
    return acc;
  }, {});
  const showCreate = params.action === "create";
  const totalLearners = data.classes.reduce((sum, item) => sum + item._count.students, 0);
  const levels = Object.keys(grouped).length;

  return (
    <AppShell universe="school" title="Classes & Houses" subtitle="Design the school's learner structure first: grades contain class groups, and class groups become the operational unit for teaching and attendance." active="Classes & Houses" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="students-workspace">
        <section className="students-hero"><div><div className="eyebrow">Admissions · Academic structure</div><h2>Build the school structure before you fill it.</h2><p>Use a simple hierarchy: <b>Grade 5</b> contains <b>5A</b>, <b>5B</b>, <b>5C</b>. Give each group an optional class teacher. Students can then be placed into the correct group during admission or from the Students page.</p></div><div className="hero-actions"><Link href="/school/students" className="button secondary">Back to students</Link><Link href="/school/classes?action=create" className="button primary">+ Create class</Link></div></section>
        <section className="student-metrics"><article><span>Grade levels</span><strong>{levels}</strong><small>Distinct levels in the school</small></article><article><span>Class groups</span><strong>{data.classes.length}</strong><small>Operational learner groups</small></article><article><span>Learners grouped</span><strong>{totalLearners}</strong><small>Students assigned to these groups</small></article></section>
        <section className="class-structure-card"><div className="section-head"><div><div className="eyebrow">Hierarchy</div><h3>Grade → class group</h3><p>Keep group names predictable. For example: Grade 5 → 5A, 5B. Later, the same groups can feed class attendance, subjects, timetable and reporting.</p></div></div>{data.classes.length === 0 ? <div className="structure-empty"><div className="empty-icon">◎</div><strong>No classes have been created yet.</strong><p>Start with the levels your school actually uses, then add the streams or sections under each level.</p><Link href="/school/classes?action=create" className="text-link">Create your first class →</Link></div> : <div className="grade-grid">{Object.entries(grouped).map(([level, sections]) => <article className="grade-card" key={level}><div className="grade-title"><div><span className="grade-kicker">Grade</span><h4>{level}</h4></div><span className="grade-total">{sections.reduce((sum, item) => sum + item._count.students, 0)} learners</span></div><div className="section-list">{sections.map((schoolClass) => <Link href={`/school/classes?class=${schoolClass.id}`} className={`section-row ${selected?.id === schoolClass.id ? "selected" : ""}`} key={schoolClass.id}><span className="section-badge">{schoolClass.name.replace(/^Grade\s*\d+\s*/i, "").replace(/^Class\s*/i, "") || schoolClass.name.slice(0, 2)}</span><span className="section-main"><b>{schoolClass.name}</b><small>{schoolClass.classTeacher?.name ?? "No class teacher assigned"}</small></span><span className="section-count">{schoolClass._count.students}</span><span className="chevron">›</span></Link>)}</div></article>)}</div>}</section>
        {selected ? <section className="student-register-card"><div className="section-head"><div><div className="eyebrow">Class group</div><h3>{selected.level ? `${selected.level} · ` : ""}{selected.name}</h3><p>{selected.classTeacher?.name ? `Class teacher: ${selected.classTeacher.name}.` : "No class teacher assigned yet."} This is the group that students, attendance and future schedules can reference.</p></div><Link href="/school/students" className="button secondary">View students</Link></div><div className="insight-links"><Link href="/school/attendance">Take attendance <span>→</span></Link><Link href="/school/subjects">Assign subjects <span>→</span></Link><Link href="/school/timetable">Schedule classes <span>→</span></Link><Link href="/school/gradebook">Open gradebook <span>→</span></Link></div></section> : null}
        {showCreate ? <section className="form-card"><div><div className="eyebrow">Create a class group</div><h3>Example: Grade 5 → 5A</h3><p>Grade is the academic level. Class group is the smaller learner group under that level.</p></div><form action={createClass} className="student-form"><label>Grade level<input name="level" required placeholder="Grade 5" /></label><label>Class group<input name="name" required placeholder="5A" /></label><label>Class teacher<select name="classTeacherId" defaultValue=""><option value="">Not assigned yet</option>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><button type="submit" className="button primary">Create class</button></form></section> : null}
      </div>
    </AppShell>
  );
}
