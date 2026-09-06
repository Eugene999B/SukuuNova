import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SubjectAssignDialog, SubjectCreateDialog } from "@/components/subjects/SubjectDialogs";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./subjects.css";

async function createSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Subject name is required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const duplicate = await tx.subject.findFirst({ where: { schoolId: session.schoolId, name }, select: { id: true } });
    if (duplicate) throw new Error("That subject already exists.");
    const subject = await tx.subject.create({ data: { schoolId: session.schoolId, name } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.created", entityType: "Subject", entityId: subject.id, after: { name } } });
  });
  redirect("/school/subjects");
}

async function updateSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!subjectId || !name) throw new Error("Subject and name are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const subject = await tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true } });
    if (!subject) throw new Error("Subject not found.");
    const duplicate = await tx.subject.findFirst({ where: { schoolId: session.schoolId, name, NOT: { id: subjectId } }, select: { id: true } });
    if (duplicate) throw new Error("That subject name is already in use.");
    await tx.subject.update({ where: { id: subjectId }, data: { name } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.updated", entityType: "Subject", entityId: subjectId, before: { name: subject.name }, after: { name } } });
  });
  redirect(`/school/subjects?subject=${encodeURIComponent(subjectId)}`);
}

async function deleteSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  if (!subjectId) throw new Error("Subject is required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const subject = await tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true, _count: { select: { teacherAssignments: true, assessments: true, scores: true, timetableSlots: true } } } });
    if (!subject) throw new Error("Subject not found.");
    const used = subject._count.teacherAssignments + subject._count.assessments + subject._count.scores + subject._count.timetableSlots;
    if (used > 0) throw new Error("This subject is already in use. Remove its assignments first instead of deleting academic history.");
    await tx.subject.delete({ where: { id: subjectId } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.deleted", entityType: "Subject", entityId: subjectId, before: { name: subject.name } } });
  });
  redirect("/school/subjects");
}

async function assignSubject(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const classIds = formData.getAll("classIds").map(String).map((value) => value.trim()).filter(Boolean);
  if (!subjectId || !teacherId || classIds.length === 0) throw new Error("Choose a subject, teacher and at least one class.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [subject, teacher, schoolClasses] = await Promise.all([
      tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true } }),
      tx.user.findFirst({ where: { id: teacherId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId, id: { in: classIds } }, select: { id: true, name: true } }),
    ]);
    if (!subject || !teacher || schoolClasses.length !== classIds.length) throw new Error("One or more selected records do not belong to this school.");
    for (const schoolClass of schoolClasses) {
      await tx.classSubjectTeacher.upsert({ where: { classId_subjectId_teacherId: { classId: schoolClass.id, subjectId, teacherId } }, update: {}, create: { schoolId: session.schoolId, classId: schoolClass.id, subjectId, teacherId } });
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.assigned_bulk", entityType: "ClassSubjectTeacher", entityId: `${subjectId}:${teacherId}`, after: { subjectId, teacherId, classIds } } });
  });
  redirect(`/school/subjects?subject=${encodeURIComponent(subjectId)}`);
}

async function removeAssignment(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  if (!subjectId || !classId || !teacherId) throw new Error("Assignment details are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const assignment = await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, classId, subjectId, teacherId }, select: { classId: true, subjectId: true, teacherId: true } });
    if (!assignment) throw new Error("Assignment not found.");
    await tx.classSubjectTeacher.delete({ where: { classId_subjectId_teacherId: { classId, subjectId, teacherId } } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.assignment_removed", entityType: "ClassSubjectTeacher", entityId: `${classId}:${subjectId}:${teacherId}`, before: { subjectId, classId, teacherId } } });
  });
  redirect(`/school/subjects?subject=${encodeURIComponent(subjectId)}`);
}

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; subject?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, subjects, classes, teachers] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.subject.findMany({
        where: query ? { name: { contains: query, mode: "insensitive" } } : undefined,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { assessments: true, scores: true, timetableSlots: true, teacherAssignments: true } },
          teacherAssignments: { include: { class: { select: { id: true, name: true, level: true } }, teacher: { select: { id: true, name: true } } }, orderBy: [{ classId: "asc" }, { teacherId: "asc" }] },
        },
      }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return { school, subjects, classes, teachers };
  });

  const selectedSubject = data.subjects.find((subject) => subject.id === params.subject) ?? data.subjects[0] ?? null;
  const totalAssignments = data.subjects.reduce((sum, subject) => sum + subject.teacherAssignments.length, 0);
  const ready = data.subjects.filter((subject) => subject.teacherAssignments.length > 0).length;
  const selectedAssignments = selectedSubject?.teacherAssignments ?? [];

  return (
    <AppShell universe="school" title="Subjects" subtitle="Subjects and assignments." active="Subjects" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="subjects-page">
        <section className="subjects-header">
          <div>
            <span className="subjects-kicker">ACADEMICS</span>
            <h2>Subjects</h2>
            
          </div>
          <SubjectCreateDialog action={createSubject} />
        </section>

        <section className="subjects-stats">
          <div><span>Subjects</span><strong>{data.subjects.length}</strong></div>
          <div><span>Assigned</span><strong>{ready}</strong></div>
          <div><span>Teaching links</span><strong>{totalAssignments}</strong></div>
        </section>

        <section className="subjects-toolbar">
          <form method="get" className="subjects-search">
            <span>⌕</span><input name="q" defaultValue={query} placeholder="Search subjects" /><button type="submit">Search</button>
          </form>
          <div className="subjects-toolbar-actions"><Link href="/school/classes">Classes</Link><Link href="/school/timetable">Timetable</Link><Link href="/school/academics/performance">Gradebook</Link></div>
        </section>

        <div className="subjects-layout">
          <section className="subjects-list-card">
            <div className="subjects-list-head"><div><span className="subjects-kicker">CATALOGUE</span><h3>{query ? `Results for “${query}”` : "School subjects"}</h3></div><span>{data.subjects.length}</span></div>
            <div className="subject-list">
              {data.subjects.length === 0 ? <div className="subject-empty"><strong>No subjects found</strong></div> : data.subjects.map((subject) => {
                const active = selectedSubject?.id === subject.id;
                const classCount = new Set(subject.teacherAssignments.map((assignment) => assignment.class.id)).size;
                return <Link key={subject.id} href={`/school/subjects?subject=${encodeURIComponent(subject.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className={`subject-row ${active ? "active" : ""}`}>
                  <span className="subject-icon">{subject.name.slice(0, 1).toUpperCase()}</span>
                  <span className="subject-row-main"><strong>{subject.name}</strong><small>{classCount ? `${classCount} class${classCount === 1 ? "" : "es"} · ${subject.teacherAssignments.length} teaching link${subject.teacherAssignments.length === 1 ? "" : "s"}` : "Not assigned yet"}</small></span>
                  <span className={`subject-status ${subject.teacherAssignments.length ? "ready" : "attention"}`}>{subject.teacherAssignments.length ? "Ready" : "Set up"}</span>
                  <span className="subject-chevron">›</span>
                </Link>;
              })}
            </div>
          </section>

          <aside className="subject-detail-card">
            {selectedSubject ? <>
              <div className="subject-detail-top"><div><span className="subjects-kicker">SUBJECT</span><h3>{selectedSubject.name}</h3></div><span className="subject-count-pill">{selectedSubject.teacherAssignments.length} links</span></div>

              <div className="subject-detail-metrics">
                <div><span>Classes</span><strong>{new Set(selectedAssignments.map((assignment) => assignment.class.id)).size}</strong></div>
                <div><span>Assessments</span><strong>{selectedSubject._count.assessments}</strong></div>
                <div><span>Timetable</span><strong>{selectedSubject._count.timetableSlots}</strong></div>
              </div>

              <div className="subject-detail-section"><div className="subject-section-head"><div><span className="subjects-kicker">TEACHING</span><h4>Assign to classes</h4></div></div>
                <SubjectAssignDialog subjectId={selectedSubject.id} subjectName={selectedSubject.name} teachers={data.teachers} classes={data.classes} action={assignSubject} />
              </div>

              <div className="subject-detail-section"><div className="subject-section-head"><div><span className="subjects-kicker">CURRENT LINKS</span><h4>Teaching assignments</h4></div></div>
                <div className="assignment-list">{selectedAssignments.length ? selectedAssignments.map((assignment) => <div className="assignment-row" key={`${assignment.class.id}:${assignment.teacher.id}`}><div><strong>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name}</strong><span>{assignment.teacher.name}</span></div><form action={removeAssignment}><input type="hidden" name="subjectId" value={selectedSubject.id}/><input type="hidden" name="classId" value={assignment.class.id}/><input type="hidden" name="teacherId" value={assignment.teacher.id}/><ConfirmSubmitButton ariaLabel={`Remove ${assignment.teacher.name} from ${assignment.class.name}`} message={`Remove ${assignment.teacher.name} from ${assignment.class.name} for ${selectedSubject.name}? Scheduled lessons stay until the timetable is regenerated.`}>Remove</ConfirmSubmitButton></form></div>) : <div className="assignment-empty">No teacher assignments yet.</div>}</div>
              </div>

              <div className="subject-detail-section compact"><div className="subject-section-head"><div><span className="subjects-kicker">RENAME</span><h4>Subject name</h4></div></div><form action={updateSubject} className="rename-form"><input type="hidden" name="subjectId" value={selectedSubject.id}/><input name="name" required defaultValue={selectedSubject.name}/><button type="submit">Save</button></form></div>

              <div className="subject-danger"><form action={deleteSubject}><input type="hidden" name="subjectId" value={selectedSubject.id}/><span>{selectedSubject._count.teacherAssignments || selectedSubject._count.assessments || selectedSubject._count.scores || selectedSubject._count.timetableSlots ? "In use — keep academic history intact." : "No academic records depend on this subject."}</span><ConfirmSubmitButton disabled={Boolean(selectedSubject._count.teacherAssignments || selectedSubject._count.assessments || selectedSubject._count.scores || selectedSubject._count.timetableSlots)} message={`Delete the subject "${selectedSubject.name}" permanently? This cannot be undone.`}>Delete subject</ConfirmSubmitButton></form></div>
            </> : <div className="subject-empty detail"><strong>Start with your subject catalogue</strong></div>}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
