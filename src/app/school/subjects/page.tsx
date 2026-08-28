import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../module-workspace.css";

async function createSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Subject name is required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const subject = await tx.subject.create({ data: { schoolId: session.schoolId, name } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.created", entityType: "Subject", entityId: subject.id, after: { name } } });
  });
  redirect("/school/subjects");
}

async function assignSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  if (!subjectId || !classId || !teacherId) throw new Error("Subject, class and teacher are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [subject, schoolClass, teacher] = await Promise.all([
      tx.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
      tx.class.findUnique({ where: { id: classId }, select: { id: true, name: true } }),
      tx.user.findUnique({ where: { id: teacherId }, select: { id: true, name: true } })
    ]);
    if (!subject || !schoolClass || !teacher) throw new Error("One or more selected records do not belong to this school.");
    await tx.classSubjectTeacher.upsert({ where: { classId_subjectId_teacherId: { classId, subjectId, teacherId } }, update: {}, create: { schoolId: session.schoolId, classId, subjectId, teacherId } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.assigned", entityType: "ClassSubjectTeacher", entityId: `${classId}:${subjectId}:${teacherId}`, after: { subjectId, classId, teacherId } } });
  });
  redirect("/school/subjects");
}

export default async function SubjectsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, subjects, classes, teachers] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { assessments: true, scores: true, timetableSlots: true, teacherAssignments: true } }, teacherAssignments: { include: { class: { select: { id: true, name: true, level: true } }, teacher: { select: { id: true, name: true } } }, orderBy: [{ classId: "asc" }, { teacherId: "asc" }] } } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.user.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    ]);
    return { school, subjects, classes, teachers };
  });

  const assignments = data.subjects.reduce((sum, subject) => sum + subject.teacherAssignments.length, 0);
  const unassigned = data.subjects.filter((subject) => subject.teacherAssignments.length === 0).length;
  const overloaded = data.subjects.filter((subject) => subject.teacherAssignments.length >= 5).length;

  return (
    <AppShell universe="school" title="Subjects & Curriculum" subtitle="Build the subject catalogue, map subjects to class groups, assign teaching ownership and give academics a reliable foundation." active="Subjects" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="module-workspace">
        <section className="module-setup-card module-card">
          <div>
            <span className="module-overline">Academic structure</span>
            <h3>A subject becomes operational when it has a class and a teacher.</h3>
            <p>SukuuNova now treats the subject catalogue as the shared source for teaching, assessment, timetable and gradebook workflows. Start with the catalogue, then assign ownership by class.</p>
          </div>
          <div className="module-setup-list">
            <a href="#create-subject"><span>1</span>Create subject <b>Catalogue record</b></a>
            <a href="#assign"><span>2</span>Map to class <b>Grade/stream context</b></a>
            <a href="#assign"><span>3</span>Assign teacher <b>Named teaching owner</b></a>
            <Link href="/school/timetable"><span>4</span>Use in timetable <b>Schedule teaching slots</b></Link>
          </div>
        </section>

        <div className="module-metrics">
          <article><span>Subjects</span><strong>{data.subjects.length}</strong><small>Live catalogue records</small></article>
          <article><span>Teaching assignments</span><strong>{assignments}</strong><small>Class + subject + teacher mappings</small></article>
          <article className={unassigned ? "attention" : "ok"}><span>Unassigned subjects</span><strong>{unassigned}</strong><small>{unassigned ? "Give these subjects teaching ownership" : "All subjects have owners"}</small></article>
          <article><span>High-load subjects</span><strong>{overloaded}</strong><small>Five or more assignment rows</small></article>
        </div>

        <div className="module-split">
          <section className="module-card" id="create-subject">
            <div className="module-section-title"><div><span>Catalogue</span><h3>Add a subject</h3><p>Keep naming consistent because this record will appear across reports and results.</p></div></div>
            <form action={createSubject} style={{ display: "grid", gap: 10, marginTop: 15 }}>
              <input name="name" required placeholder="e.g. Mathematics" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", color: "#e5f3ef" }} />
              <button className="module-hero-button" type="submit">Create subject →</button>
            </form>
            <div className="module-empty" style={{ marginTop: 16 }}><strong>Recommended use</strong><p>Prefer one canonical subject name per school. Classes can share the same subject record while teacher assignments remain class-specific.</p></div>
          </section>

          <section className="module-card" id="assign">
            <div className="module-section-title"><div><span>Teaching ownership</span><h3>Assign subject to class + teacher</h3><p>The assignment becomes the bridge used by the timetable, teacher workload and assessment systems.</p></div></div>
            <form action={assignSubject} style={{ display: "grid", gap: 10, marginTop: 15 }}>
              <select name="subjectId" required defaultValue="" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
              <select name="classId" required defaultValue="" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose class</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select>
              <select name="teacherId" required defaultValue="" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose teacher</option>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
              <button className="module-hero-button" type="submit">Assign teaching owner →</button>
            </form>
          </section>
        </div>

        <section className="module-card">
          <div className="module-section-title"><div><span>Operating catalogue</span><h3>Subject register</h3><p>See where every subject is being taught and how much downstream activity it already has.</p></div><Link href="/school/classes">Review class structure →</Link></div>
          <div className="module-table-wrap"><table><thead><tr><th>Subject</th><th>Classes</th><th>Teachers</th><th>Assessment</th><th>Gradebook</th><th>Schedule</th></tr></thead><tbody>{data.subjects.length ? data.subjects.map((subject) => <tr key={subject.id}><td style={{ padding: 12 }}><strong>{subject.name}</strong><div style={{ color: "#60787d", fontSize: 8 }}>{subject.teacherAssignments.length ? "Assigned" : "Needs ownership"}</div></td><td style={{ padding: 12 }}>{subject.teacherAssignments.map((assignment) => `${assignment.class.level ? `${assignment.class.level} · ` : ""}${assignment.class.name}`).join(", ") || "—"}</td><td style={{ padding: 12 }}>{Array.from(new Set(subject.teacherAssignments.map((assignment) => assignment.teacher.name))).join(", ") || "—"}</td><td style={{ padding: 12 }}>{subject._count.assessments}</td><td style={{ padding: 12 }}>{subject._count.scores}</td><td style={{ padding: 12 }}>{subject._count.timetableSlots}</td></tr>) : <tr><td colSpan={6}><div className="module-empty"><div className="module-empty-mark">◇</div><strong>No subjects yet</strong><p>Create the catalogue before building teacher and class mappings.</p></div></td></tr>}</tbody></table></div>
        </section>

        <section className="module-card">
          <div className="module-section-title"><div><span>Connected workflow</span><h3>One assignment, many school functions</h3><p>The same class-subject-teacher relationship becomes the context for daily teaching and academic records.</p></div></div>
          <div className="module-workflow">
            {[
              ["01", "Timetable", "Schedule the assigned teacher against the class and subject."],
              ["02", "Lessons", "Plan lessons and teaching resources for the right class."],
              ["03", "Homework", "Assign work to the same class/subject context."],
              ["04", "Gradebook", "Enter and validate scores under the assigned subject."],
              ["05", "Report cards", "Carry verified subject outcomes into learner reports"]
            ].map(([step, title, detail]) => <div className="module-workflow-step" key={step}><span>{step}</span><div><strong>{title}</strong><small>{detail}</small></div></div>)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
