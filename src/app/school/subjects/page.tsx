import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SubjectAssignDialog, SubjectCreateDialog } from "@/components/subjects/SubjectDialogs";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { isTeachingAccount, requireActiveTeachingTarget } from "@/lib/authorization";
import "./subjects.css";
import "./subjects-simple.css";

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
    const teacher = await requireActiveTeachingTarget(tx, session.schoolId, teacherId);
    const [subject, schoolClasses] = await Promise.all([
      tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId, id: { in: classIds } }, select: { id: true, name: true } }),
    ]);
    if (!subject || schoolClasses.length !== classIds.length) throw new Error("One or more selected records do not belong to this school.");
    for (const schoolClass of schoolClasses) {
      await tx.classSubjectTeacher.upsert({ where: { classId_subjectId_teacherId: { classId: schoolClass.id, subjectId, teacherId } }, update: {}, create: { schoolId: session.schoolId, classId: schoolClass.id, subjectId, teacherId } });
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "subject.assigned_bulk", entityType: "ClassSubjectTeacher", entityId: `${subjectId}:${teacherId}`, after: { subjectId, teacherId, teacherName: teacher.name, classIds } } });
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
    const [school, subjects, classes, teacherCandidates] = await Promise.all([
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
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } } }),
    ]);
    const teachers = teacherCandidates.filter((user) => isTeachingAccount(user.userRoles.map(({ role }) => role))).map(({ userRoles: _roles, ...user }) => user);
    return { school, subjects, classes, teachers };
  });

  const selectedSubject = data.subjects.find((subject) => subject.id === params.subject) ?? data.subjects[0] ?? null;
  const totalAssignments = data.subjects.reduce((sum, subject) => sum + subject.teacherAssignments.length, 0);
  const ready = data.subjects.filter((subject) => subject.teacherAssignments.length > 0).length;
  const selectedAssignments = selectedSubject?.teacherAssignments ?? [];
  const subjectInUse = selectedSubject ? Boolean(selectedSubject._count.teacherAssignments || selectedSubject._count.assessments || selectedSubject._count.scores || selectedSubject._count.timetableSlots) : false;

  return (
    <AppShell universe="school" title="Subjects" subtitle="Find a subject, connect teachers and classes, and keep setup out of the way until needed." active="Subjects" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="subjects-page subjects-simple">
        <section className="subjects-header">
          <div><span className="subjects-kicker">ACADEMICS</span><h2>Subject catalogue</h2></div>
          <SubjectCreateDialog action={createSubject} />
        </section>

        <section className="subjects-stats" aria-label="Subject summary">
          <div><span>Subjects</span><strong>{data.subjects.length}</strong></div>
          <div><span>Assigned</span><strong>{ready}</strong></div>
          <div><span>Teaching links</span><strong>{totalAssignments}</strong></div>
        </section>

        <section className="subjects-toolbar">
          <form method="get" className="subjects-search"><span>⌕</span><input name="q" defaultValue={query} placeholder="Search subjects" /><button type="submit">Search</button></form>
          <div className="subjects-toolbar-actions"><Link href="/school/classes">Classes</Link><Link href="/school/timetable">Timetable</Link><Link href="/school/gradebook">Gradebook</Link></div>
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
              <div className="subject-detail-top"><div><span className="subjects-kicker">SELECTED SUBJECT</span><h3>{selectedSubject.name}</h3></div><span className="subject-count-pill">{selectedSubject.teacherAssignments.length} teaching link{selectedSubject.teacherAssignments.length === 1 ? "" : "s"}</span></div>
              <div className="subject-detail-metrics"><div><span>Classes</span><strong>{new Set(selectedAssignments.map((assignment) => assignment.class.id)).size}</strong></div><div><span>Assessments</span><strong>{selectedSubject._count.assessments}</strong></div><div><span>Timetable</span><strong>{selectedSubject._count.timetableSlots}</strong></div></div>

              <section className="subject-detail-primary"><span className="subjects-kicker">PRIMARY ACTION</span><h4>Connect this subject to teaching</h4><SubjectAssignDialog subjectId={selectedSubject.id} subjectName={selectedSubject.name} teachers={data.teachers} classes={data.classes} action={assignSubject} /></section>

              <details className="sn-progressive subject-settings">
                <summary>Teaching assignments ({selectedAssignments.length})</summary>
                <div className="sn-progressive-body">
                  <div className="assignment-list">{selectedAssignments.length ? selectedAssignments.map((assignment) => <div className="assignment-row" key={`${assignment.class.id}:${assignment.teacher.id}`}><div><strong>{assignment.class.level ? `${assignment.class.level} · ` : ""}{assignment.class.name}</strong><span>{assignment.teacher.name}</span></div><form action={removeAssignment}><input type="hidden" name="subjectId" value={selectedSubject.id}/><input type="hidden" name="classId" value={assignment.class.id}/><input type="hidden" name="teacherId" value={assignment.teacher.id}/><button type="submit" aria-label={`Remove ${assignment.teacher.name} from ${assignment.class.name}`}>Remove</button></form></div>) : <div className="assignment-empty">No teacher assignments yet.</div>}</div>
                </div>
              </details>

              <details className="sn-progressive subject-settings">
                <summary>Rename or delete subject</summary>
                <div className="sn-progressive-body subject-admin-row">
                  <section className="subject-admin-card"><h4>Rename subject</h4><form action={updateSubject} className="rename-form"><input type="hidden" name="subjectId" value={selectedSubject.id}/><input name="name" required defaultValue={selectedSubject.name}/><button type="submit">Save</button></form></section>
                  <section className="subject-admin-card subject-danger"><h4>Delete subject</h4><form action={deleteSubject}><input type="hidden" name="subjectId" value={selectedSubject.id}/><span>{subjectInUse ? "This subject is in use, so its academic history must be preserved." : "No academic records depend on this subject."}</span><button type="submit" disabled={subjectInUse}>Delete subject</button></form></section>
                </div>
              </details>
            </> : <div className="subject-empty detail"><strong>Choose a subject to manage it.</strong></div>}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
