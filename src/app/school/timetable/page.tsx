import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./timetable.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function createSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const classId = String(formData.get("classId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const period = Number(formData.get("period"));
  if (!classId || !subjectId || !teacherId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6 || !Number.isInteger(period) || period < 1 || period > 12) throw new Error("Complete the class, subject, teacher, day and period.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [schoolClass, subject, teacher, existingClassSlot, existingTeacherSlot] = await Promise.all([
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }),
      tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true } }),
      tx.user.findFirst({ where: { id: teacherId, schoolId: session.schoolId, status: "active" }, select: { id: true } }),
      tx.timetableSlot.findUnique({ where: { schoolId_classId_dayOfWeek_period: { schoolId: session.schoolId, classId, dayOfWeek, period } }, select: { id: true } }),
      tx.timetableSlot.findFirst({ where: { schoolId: session.schoolId, teacherId, dayOfWeek, period }, select: { id: true } }),
    ]);
    if (!schoolClass || !subject || !teacher) throw new Error("One or more selected records do not belong to this school.");
    if (existingClassSlot) throw new Error("That class already has a lesson in this period.");
    if (existingTeacherSlot) throw new Error("That teacher is already scheduled in this period.");
    const slot = await tx.timetableSlot.create({ data: { schoolId: session.schoolId, classId, subjectId, teacherId, dayOfWeek, period } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "timetable.created", entityType: "TimetableSlot", entityId: slot.id, after: { classId, subjectId, teacherId, dayOfWeek, period } } });
  });
  redirect(`/school/timetable?classId=${encodeURIComponent(classId)}`);
}

async function updateSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const slotId = String(formData.get("slotId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const period = Number(formData.get("period"));
  if (!slotId || !classId || !subjectId || !teacherId) throw new Error("Complete the lesson details.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const current = await tx.timetableSlot.findFirst({ where: { id: slotId, schoolId: session.schoolId }, select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true } });
    if (!current) throw new Error("Timetable lesson not found.");
    const [schoolClass, subject, teacher, conflictingClass, conflictingTeacher] = await Promise.all([
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }),
      tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true } }),
      tx.user.findFirst({ where: { id: teacherId, schoolId: session.schoolId, status: "active" }, select: { id: true } }),
      tx.timetableSlot.findFirst({ where: { schoolId: session.schoolId, classId, dayOfWeek, period, NOT: { id: slotId } }, select: { id: true } }),
      tx.timetableSlot.findFirst({ where: { schoolId: session.schoolId, teacherId, dayOfWeek, period, NOT: { id: slotId } }, select: { id: true } }),
    ]);
    if (!schoolClass || !subject || !teacher) throw new Error("One or more selected records do not belong to this school.");
    if (conflictingClass) throw new Error("That class already has a lesson in the selected period.");
    if (conflictingTeacher) throw new Error("That teacher is already scheduled in the selected period.");
    await tx.timetableSlot.update({ where: { id: slotId }, data: { classId, subjectId, teacherId, dayOfWeek, period } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "timetable.updated", entityType: "TimetableSlot", entityId: slotId, before: current, after: { classId, subjectId, teacherId, dayOfWeek, period } } });
  });
  redirect(`/school/timetable?classId=${encodeURIComponent(classId)}`);
}

async function deleteSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const slotId = String(formData.get("slotId") ?? "").trim();
  if (!slotId) throw new Error("Lesson is required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const slot = await tx.timetableSlot.findFirst({ where: { id: slotId, schoolId: session.schoolId }, select: { id: true, classId: true, subjectId: true, teacherId: true, dayOfWeek: true, period: true } });
    if (!slot) throw new Error("Timetable lesson not found.");
    await tx.timetableSlot.delete({ where: { id: slotId } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "timetable.deleted", entityType: "TimetableSlot", entityId: slotId, before: slot } });
  });
  redirect("/school/timetable");
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ classId?: string; edit?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const selectedClassId = String(params.classId ?? "").trim();
  const editId = String(params.edit ?? "").trim();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [school, classes, subjects, teachers, slots] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.timetableSlot.findMany({ where: selectedClassId ? { schoolId: session.schoolId, classId: selectedClassId } : { schoolId: session.schoolId }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], include: { class: { select: { name: true, level: true } }, subject: { select: { name: true } }, teacher: { select: { name: true } } } }),
    ]);
    return { school, classes, subjects, teachers, slots };
  });
  const editSlot = data.slots.find((slot) => slot.id === editId) ?? null;
  const selectedClassName = data.classes.find((item) => item.id === selectedClassId)?.name ?? "All classes";
  const classIds = new Set(data.slots.map((slot) => slot.classId));
  const teacherIds = new Set(data.slots.map((slot) => slot.teacherId));

  return (
    <AppShell universe="school" title="Timetable" subtitle="Build and maintain the school's weekly teaching schedule." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <main className="timetable-page">
        <section className="timetable-hero">
          <div><span className="timetable-eyebrow">ACADEMICS · SCHEDULING</span><h1>The school week, in one clear view.</h1><p>Choose a class, build its week, and edit any lesson directly. Every save checks the class and teacher for double-booking.</p></div>
          <div className="timetable-actions"><Link href="/school/timetable/print" className="secondary-action">Print</Link><Link href="/school/timetable" className="secondary-action">Reset view</Link><Link href={`/school/timetable?classId=${encodeURIComponent(selectedClassId)}&edit=new`} className="primary-action">+ Add lesson</Link></div>
        </section>

        <section className="timetable-commandbar">
          <div className="class-picker"><label>Class</label><form method="get"><select name="classId" defaultValue={selectedClassId} onChange={(event) => event.currentTarget.form?.submit()}><option value="">All classes</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></form></div>
          <div className="command-metrics"><div><span>Lessons</span><strong>{data.slots.length}</strong></div><div><span>Classes</span><strong>{classIds.size}</strong></div><div><span>Teachers</span><strong>{teacherIds.size}</strong></div><div><span>Conflicts</span><strong className="good">0</strong></div></div>
        </section>

        <section className="timetable-board">
          <div className="board-head"><div><span className="timetable-eyebrow">WEEK VIEW</span><h2>{selectedClassName}</h2></div><span className="board-note">Select a lesson to edit subject, teacher, class, day or period.</span></div>
          <div className="week-scroll"><table><thead><tr><th>Period</th>{DAYS.map((day) => <th key={day}>{day}</th>)}</tr></thead><tbody>{Array.from({ length: 10 }, (_, periodIndex) => { const period = periodIndex + 1; return <tr key={period}><th><strong>{period}</strong><small>{`${8 + Math.floor(periodIndex / 2)}:${periodIndex % 2 === 0 ? "00" : "50"}`}</small></th>{DAYS.map((day, dayIndex) => { const slot = data.slots.find((item) => item.dayOfWeek === dayIndex + 1 && item.period === period); return <td key={day}>{slot ? <Link className="lesson" href={`/school/timetable?classId=${encodeURIComponent(slot.classId)}&edit=${encodeURIComponent(slot.id)}`}><strong>{slot.subject.name}</strong><span>{slot.teacher.name}</span>{!selectedClassId ? <small>{slot.class.name}</small> : null}</Link> : <Link className="empty-lesson" href={`/school/timetable?classId=${encodeURIComponent(selectedClassId)}&edit=new:${dayIndex + 1}:${period}`}>+</Link>}</td>; })}</tr>; })}</tbody></table></div>
        </section>

        <section className="timetable-panels">
          <div className="teacher-load"><div className="section-head"><div><span className="timetable-eyebrow">WORKLOAD</span><h3>Teacher periods</h3></div></div>{data.teachers.slice(0, 8).map((teacher) => { const count = data.slots.filter((slot) => slot.teacherId === teacher.id).length; return <div className="load-item" key={teacher.id}><div><strong>{teacher.name}</strong><span>{count} period{count === 1 ? "" : "s"}</span></div><div className="load-track"><i style={{ width: `${Math.min(100, count * 8)}%` }} /></div></div>; })}</div>
          <div className="timetable-tools"><div className="section-head"><div><span className="timetable-eyebrow">CONNECTED WORK</span><h3>Useful next actions</h3></div></div><Link href="/school/subjects">Review subject & teacher assignments</Link><Link href="/school/staff-attendance">Handle staff absences & cover</Link><Link href="/school/lessons">Open lesson planning</Link><Link href="/school/timetable/print">Generate print-ready schedules</Link></div>
        </section>

        {editId ? <div className="edit-drawer"><div className="edit-panel"><div className="edit-panel-head"><div><span className="timetable-eyebrow">{editSlot ? "EDIT LESSON" : "NEW LESSON"}</span><h2>{editSlot ? `Edit ${editSlot.subject.name}` : "Add a timetable lesson"}</h2></div><Link href={`/school/timetable${selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : ""}`} aria-label="Close">×</Link></div><form action={editSlot ? updateSlot : createSlot}>{editSlot ? <input type="hidden" name="slotId" value={editSlot.id} /> : null}<label>Class<select name="classId" required defaultValue={editSlot?.classId ?? selectedClassId}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label><label>Subject<select name="subjectId" required defaultValue={editSlot?.subjectId ?? ""}><option value="">Choose subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Teacher<select name="teacherId" required defaultValue={editSlot?.teacherId ?? ""}><option value="">Choose teacher</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="edit-two"><label>Day<select name="dayOfWeek" required defaultValue={editSlot?.dayOfWeek ?? (editId.startsWith("new:") ? editId.split(":")[1] : "1")}>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><label>Period<select name="period" required defaultValue={editSlot?.period ?? (editId.startsWith("new:") ? editId.split(":")[2] : "1")}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Period {index + 1}</option>)}</select></label></div><div className="edit-actions"><Link href={`/school/timetable${selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : ""}`} className="secondary-action">Cancel</Link><button className="primary-action" type="submit">Save lesson</button></div></form>{editSlot ? <form action={deleteSlot} className="delete-slot"><input type="hidden" name="slotId" value={editSlot.id}/><button type="submit">Delete this lesson</button></form> : null}</div></div> : null}
      </main>
    </AppShell>
  );
}
