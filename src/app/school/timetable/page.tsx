import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../module-workspace.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function createSlot(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const classId = String(formData.get("classId") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const period = Number(formData.get("period"));
  if (!classId || !subjectId || !teacherId || !Number.isInteger(dayOfWeek) || !Number.isInteger(period) || dayOfWeek < 1 || dayOfWeek > 6 || period < 1 || period > 12) throw new Error("Class, subject, teacher, day and period are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [schoolClass, subject, teacher, existingClassSlot, existingTeacherSlot] = await Promise.all([
      tx.class.findUnique({ where: { id: classId }, select: { id: true, name: true } }),
      tx.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
      tx.user.findUnique({ where: { id: teacherId }, select: { id: true, name: true } }),
      tx.timetableSlot.findUnique({ where: { schoolId_classId_dayOfWeek_period: { schoolId: session.schoolId, classId, dayOfWeek, period } }, select: { id: true } }),
      tx.timetableSlot.findFirst({ where: { schoolId: session.schoolId, teacherId, dayOfWeek, period }, select: { id: true, class: { select: { name: true } } } })
    ]);
    if (!schoolClass || !subject || !teacher) throw new Error("One or more selected records do not belong to this school.");
    if (existingClassSlot) throw new Error("That class already has a timetable slot in this period.");
    if (existingTeacherSlot) throw new Error(`That teacher is already scheduled for ${existingTeacherSlot.class.name} in this period.`);
    const slot = await tx.timetableSlot.create({ data: { schoolId: session.schoolId, classId, subjectId, teacherId, dayOfWeek, period } });
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "timetable.created", entityType: "TimetableSlot", entityId: slot.id, after: { classId, subjectId, teacherId, dayOfWeek, period } } });
  });
  redirect("/school/timetable");
}

export default async function TimetablePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [school, classes, subjects, teachers, slots] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.user.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.timetableSlot.findMany({ orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], include: { class: { select: { name: true, level: true } }, subject: { select: { name: true } }, teacher: { select: { name: true } }, substitutes: { select: { id: true, assignmentDate: true, substituteTeacher: { select: { name: true } } }, orderBy: { assignmentDate: "desc" }, take: 3 } } })
    ]);
    return { school, classes, subjects, teachers, slots };
  });

  const classClashes = new Set<string>();
  const teacherClashes = new Set<string>();
  for (const slot of data.slots) {
    const classKey = `${slot.dayOfWeek}:${slot.period}:${slot.class.name}`;
    const teacherKey = `${slot.dayOfWeek}:${slot.period}:${slot.teacher.name}`;
    if (data.slots.filter((x) => `${x.dayOfWeek}:${x.period}:${x.class.name}` === classKey).length > 1) classClashes.add(classKey);
    if (data.slots.filter((x) => `${x.dayOfWeek}:${x.period}:${x.teacher.name}` === teacherKey).length > 1) teacherClashes.add(teacherKey);
  }

  const byDay = DAYS.map((name, index) => ({ name, day: index + 1, slots: data.slots.filter((slot) => slot.dayOfWeek === index + 1) }));
  const conflictCount = classClashes.size + teacherClashes.size;

  return (
    <AppShell universe="school" title="Timetable" subtitle="Design the weekly teaching grid around real class, subject and teacher assignments, with clash protection before anything is published." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="module-workspace">
        <section className="module-setup-card module-card">
          <div><span className="module-overline">Academic operations</span><h3>The timetable is the school's weekly operating map.</h3><p>Every slot connects a class, subject and teacher. SukuuNova blocks duplicate class periods and teacher collisions before saving, so the published timetable can become the reliable source for lessons, attendance and substitutions.</p></div>
          <div className="module-setup-list"><Link href="#create"><span>1</span>Create slot <b>Class + subject + teacher</b></Link><Link href="#weekly-grid"><span>2</span>Review the week <b>Spot gaps and conflicts</b></Link><Link href="/school/subjects"><span>3</span>Review assignments <b>Teacher ownership</b></Link><Link href="/school/staff-attendance"><span>4</span>Cover absences <b>Staff attendance → substitution</b></Link></div>
        </section>

        <div className="module-metrics"><article><span>Scheduled slots</span><strong>{data.slots.length}</strong><small>Current timetable records</small></article><article><span>Classes covered</span><strong>{new Set(data.slots.map((slot) => slot.classId)).size}</strong><small>Class groups with at least one slot</small></article><article><span>Teachers scheduled</span><strong>{new Set(data.slots.map((slot) => slot.teacherId)).size}</strong><small>Teaching owners appearing in the grid</small></article><article className={conflictCount ? "attention" : "ok"}><span>Detected conflicts</span><strong>{conflictCount}</strong><small>{conflictCount ? "Review before publishing" : "No duplicate class or teacher periods"}</small></article></div>

        <section className="module-card" id="create"><div className="module-section-title"><div><span>Build the grid</span><h3>Add timetable slot</h3><p>Keep each period single-owner for both the class and teacher.</p></div></div><form action={createSlot} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 15 }}><select name="classId" required defaultValue="" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select><select name="subjectId" required defaultValue="" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="teacherId" required defaultValue="" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option value="">Choose teacher</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="dayOfWeek" required defaultValue="1" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select><select name="period" required defaultValue="1" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((period) => <option key={period} value={period}>Period {period}</option>)}</select><button className="module-hero-button" type="submit">Add timetable slot →</button></form></section>

        <section className="module-card" id="weekly-grid"><div className="module-section-title"><div><span>Weekly timetable</span><h3>Teaching grid</h3><p>Each card shows the class, subject and named teacher. Substitution context is visible on the slot when one has been assigned.</p></div></div><div style={{ display: "grid", gap: 14 }}>{byDay.map((day) => <div key={day.day} style={{ display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{day.name}</strong><small style={{ color: "#6d858a" }}>{day.slots.length} scheduled</small></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>{day.slots.length ? day.slots.map((slot) => { const classKey = `${slot.dayOfWeek}:${slot.period}:${slot.class.name}`; const teacherKey = `${slot.dayOfWeek}:${slot.period}:${slot.teacher.name}`; const conflict = classClashes.has(classKey) || teacherClashes.has(teacherKey); return <div key={slot.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${conflict ? "rgba(220,110,80,.55)" : "rgba(255,255,255,.07)"}`, background: "rgba(255,255,255,.025)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>Period {slot.period}</strong>{conflict ? <span style={{ color: "#e88972", fontSize: 10 }}>Conflict</span> : null}</div><div style={{ marginTop: 6 }}><b>{slot.class.level ? `${slot.class.level} · ` : ""}{slot.class.name}</b></div><small style={{ display: "block", color: "#8fa5a7", marginTop: 4 }}>{slot.subject.name} · {slot.teacher.name}</small>{slot.substitutes[0] ? <small style={{ display: "block", color: "#a5c7bd", marginTop: 7 }}>Cover: {slot.substitutes[0].substituteTeacher.name}</small> : null}</div>; }) : <div style={{ color: "#60787d", padding: 12, borderRadius: 10, background: "rgba(255,255,255,.018)" }}>No scheduled teaching slots.</div>}</div></div>)}</div></section>

        <section className="module-card"><div className="module-section-title"><div><span>Timetable workflow</span><h3>From schedule to daily execution</h3><p>Use the same timetable record as the context for lessons, attendance, substitution and workload review.</p></div></div><div className="module-workflow">{[["01", "Lessons", "Open lesson planning against the scheduled class and subject."], ["02", "Attendance", "Take the register from the class context rather than a disconnected list."], ["03", "Substitution", "When a teacher is unavailable, assign a dated substitute to the same slot."], ["04", "Teacher workload", "Review how many periods each teacher owns before publishing."], ["05", "Change history", "Audit every slot creation and future schedule change." ]].map(([step, title, detail]) => <div className="module-workflow-step" key={step}><span>{step}</span><div><strong>{title}</strong><small>{detail}</small></div></div>)}</div></section>
      </div>
    </AppShell>
  );
}
