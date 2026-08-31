import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { recordAttendance } from "@/lib/attendance-service";

async function saveAttendance(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") || "").trim();
  const attendanceDate = String(formData.get("attendanceDate") || "").trim();
  const rawType = String(formData.get("type") || "in").trim();\n  const type: "in" | "out" = rawType === "out" ? "out" : "in";
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !["in","out"].includes(type)) throw new Error("Invalid attendance input.");
  await withTenant(session.schoolId, async tx => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !(await hasPermission(tx, session.userId, "attendance:record"))) throw new Error("You do not have teacher attendance access.");
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, classId: true } });
    if (!student?.classId) throw new Error("Student is not assigned to a class.");
    const assigned = await tx.class.findFirst({ where: { id: student.classId, OR: [{ classTeacherId: session.userId }, { subjectAssignments: { some: { teacherId: session.userId } } }] }, select: { id: true } });
    if (!assigned) throw new Error("That student is outside your teaching scope.");
    await recordAttendance(tx, { schoolId: session.schoolId, actorId: session.userId, target: { studentId }, type, method: "manual", timestamp: new Date(`${attendanceDate}T08:00:00.000Z`) });
  });
  redirect(`/teacher/attendance?date=${attendanceDate}`);
}

export default async function TeacherAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireSchoolSession();
  const date = (await searchParams).date?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || new Date().toISOString().slice(0,10);
  const data = await withTenant(session.schoolId, async tx => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher") redirect("/dashboard");
    const [school, classes, students, events] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { OR: [{ classTeacherId: session.userId }, { subjectAssignments: { some: { teacherId: session.userId } } }] }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } }),
      tx.student.findMany({ where: { status: "active", class: { OR: [{ classTeacherId: session.userId }, { subjectAssignments: { some: { teacherId: session.userId } } }] } }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } }),
      tx.attendanceEvent.findMany({ where: { attendanceDate: new Date(`${date}T00:00:00.000Z`), studentId: { not: null }, student: { class: { OR: [{ classTeacherId: session.userId }, { subjectAssignments: { some: { teacherId: session.userId } } }] } } }, include: { student: { select: { name: true, admissionNo: true, class: { select: { name: true, level: true } } } } }, orderBy: { timestamp: "desc" }, take: 300 })
    ]);
    return { school, classes, students, events };
  });
  const recorded = new Set(data.events.map(e => e.studentId).filter(Boolean));
  return <AppShell universe="teacher" title="My attendance" subtitle="Take attendance only for learners in your assigned teaching groups." active="My Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher"><div className="module-workspace"><section className="module-setup-card module-card"><div><span className="module-overline">Teacher register</span><h3>Your attendance scope</h3><p>Only learners in your class-teacher or subject-teacher assignments appear here.</p></div><div className="module-setup-list"><Link href="/teacher">↩ Teacher home</Link><Link href="/teacher/module?view=My%20Gradebook">Open my gradebook</Link><Link href="/teacher/module?view=My%20Homework">Open my homework</Link></div></section><section className="module-metrics"><article><span>Assigned classes</span><strong>{data.classes.length}</strong><small>Classes in your scope</small></article><article><span>Students in scope</span><strong>{data.students.length}</strong><small>Eligible learners</small></article><article><span>Recorded</span><strong>{recorded.size}</strong><small>Decisions on {date}</small></article><article><span>Remaining</span><strong>{Math.max(0,data.students.length-recorded.size)}</strong><small>Still need a decision</small></article></section><section className="module-card"><div className="module-section-title"><div><span>Record attendance · {date}</span><h3>Teacher register</h3><p>The server enforces your teaching scope and duplicate protection.</p></div></div><form action={saveAttendance} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:15}}><input type="date" name="attendanceDate" defaultValue={date} required /><select name="studentId" required defaultValue=""><option value="">Choose learner</option>{data.students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.class?.name ?? "Unassigned"}</option>)}</select><select name="type" defaultValue="in"><option value="in">Present</option><option value="out">Absent</option></select><button className="module-hero-button" type="submit">Save attendance →</button></form></section><section className="module-card"><div className="module-section-title"><div><span>Recorded activity</span><h3>Your register</h3></div></div><div className="module-workflow">{data.events.map(e => <div className="module-workflow-step" key={e.id}><span>{e.type.slice(0,1).toUpperCase()}</span><div><strong>{e.student?.name ?? "Unknown"}</strong><small>{e.student?.admissionNo ?? ""} · {e.student?.class?.name ?? ""} · {e.type}</small></div></div>)}{!data.events.length ? <div className="module-empty"><strong>No attendance recorded yet.</strong><p>Choose a learner above to begin.</p></div> : null}</div></section></div></AppShell>;
}
