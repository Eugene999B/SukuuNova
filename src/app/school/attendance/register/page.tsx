import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { AttendanceRegister } from "./AttendanceRegister";
import "./attendance-register.css";

function existingDecision(event: { type: string; isLate: boolean | null }) {
  if (event.type === "in") return event.isLate ? "late" : "present";
  if (event.type === "present" || event.type === "late" || event.type === "absent" || event.type === "excused") return event.type;
  return "present";
}

export default async function AttendanceRegisterPage({ searchParams }: { searchParams?: Promise<{ classId?: string; date?: string }> }) {
  const session = await requireSchoolSession();
  const params = (await searchParams) || {};
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:record");
    const canRecordAll = await hasPermission(tx, session.userId, "attendance:record_all") || await hasPermission(tx, session.userId, "attendance:review");
    if (!canRecordAll) await requirePermission(tx, session.userId, "attendance:record_assigned");

    const [school, classes, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: canRecordAll ? { schoolId: session.schoolId } : { schoolId: session.schoolId, classTeacherId: session.userId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, classTeacher: { select: { name: true } }, _count: { select: { students: true } } } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
    ]);
    const timezone = settings?.timezone || "Africa/Accra";
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
    const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
    const classId = params.classId && classes.some((item) => item.id === params.classId) ? params.classId : classes[0]?.id || "";
    const selectedClass = classes.find((c) => c.id === classId);
    const students = selectedClass ? await tx.student.findMany({ where: { schoolId: session.schoolId, classId: selectedClass.id, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, photoUrl: true } }) : [];
    const existingRows = classId && students.length ? await tx.attendanceEvent.findMany({ where: { attendanceDate: new Date(`${date}T00:00:00.000Z`), studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, type: true, isLate: true, method: true, timestamp: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }] }) : [];
    const existing = new Map<string, { decision: "present"|"late"|"absent"|"excused"; method: string; timestamp: string }>();
    for (const row of existingRows) {
      if (!row.studentId || existing.has(row.studentId)) continue;
      existing.set(row.studentId, { decision: existingDecision(row) as "present"|"late"|"absent"|"excused", method: row.method, timestamp: row.timestamp.toISOString() });
    }
    return { school, classes, selectedClass, students, existing: Object.fromEntries(existing), timezone, date, canRecordAll };
  });
  if (!data.school) redirect("/dashboard");
  return <AppShell universe="school" title="Class Attendance Register" subtitle="Fast class attendance with device-aware status." active="Student Attendance" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="attendance-register-page">
      <section className="attendance-register-context">
        <div><span>Class register</span><h2>{data.selectedClass ? `${data.selectedClass.level ? `${data.selectedClass.level} · ` : ""}${data.selectedClass.name}` : "Choose a class"}</h2><p>{data.canRecordAll ? "Leadership attendance access · all permitted classes" : "Class-teacher attendance access · assigned class only"}</p></div>
        <Link href="/school/attendance">Attendance overview</Link>
      </section>
      <section className="attendance-register-picker"><form method="get"><label>Class<select name="classId" defaultValue={data.selectedClass?.id || ""}>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.level ? `${c.level} · ` : ""}{c.name} · {c._count.students} learners</option>)}</select></label><label>Date<input name="date" type="date" defaultValue={data.date} /></label><button type="submit">Open register</button></form>{data.selectedClass ? <div><span>Class teacher</span><strong>{data.selectedClass.classTeacher?.name ?? "Not assigned"}</strong></div> : null}</section>
      {data.selectedClass ? <AttendanceRegister classId={data.selectedClass.id} attendanceDate={data.date} students={data.students} existing={data.existing} /> : <section className="attendance-register-empty"><strong>No attendance class is assigned to your account.</strong><p>Ask school leadership to assign you as a class teacher or grant the appropriate all-class attendance role.</p><Link href="/teacher">Back to Teacher Portal</Link></section>}
    </div>
  </AppShell>;
}
