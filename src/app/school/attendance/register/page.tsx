import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AttendanceRegister } from "./AttendanceRegister";

export default async function AttendanceRegisterPage({ searchParams }: { searchParams?: Promise<{ classId?: string; date?: string }> }) {
  const session = await requireSchoolSession();
  const params = (await searchParams) || {};
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:record");
    const [school, classes, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
    ]);
    const timezone = settings?.timezone || "Africa/Accra";
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
    const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
    const classId = params.classId || classes[0]?.id || "";
    const selectedClass = classes.find((c) => c.id === classId);
    const students = selectedClass ? await tx.student.findMany({ where: { schoolId: session.schoolId, classId: selectedClass.id, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true } }) : [];
    const existing = classId ? await tx.attendanceEvent.findMany({ where: { attendanceDate: new Date(`${date}T00:00:00.000Z`), studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, type: true } }) : [];
    return { school, classes, selectedClass, students, existing, timezone, date };
  });
  if (!data.school) redirect("/dashboard");
  return <AppShell universe="school" title="Class Attendance Register" subtitle="Choose one class and date, mark the roster quickly, then save the whole register as one audited operation." active="Student Attendance" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="module-workspace">
      <section className="module-card"><div className="module-section-title"><div><span>Register context</span><h3>Class → date → roster</h3><p>The register keeps the working context visible so attendance is recorded against the correct class and school day.</p></div><Link href="/school/attendance">Attendance overview →</Link></div><form method="get" className="module-toolbar" style={{ marginTop: 14 }}><label style={{ flex: 1, display: "grid", gap: 5 }}>Class<select name="classId" defaultValue={data.selectedClass?.id || ""}>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.level ? `${c.level} · ` : ""}{c.name} · {c._count.students} learners</option>)}</select></label><label style={{ width: 190, display: "grid", gap: 5 }}>Date<input name="date" type="date" defaultValue={data.date} /></label><button className="button primary" type="submit">Open register</button></form></section>
      {data.existing.length ? <section className="module-card"><div className="module-section-title"><div><span>Already recorded</span><h3>This register is complete for the selected learners</h3><p>{data.existing.length} attendance record{data.existing.length === 1 ? " is" : "s are"} already stored for this class and date. Editing from this register is intentionally blocked so the one-record-per-learner rule is not bypassed.</p></div></div><Link className="button secondary" href={`/school/attendance?date=${encodeURIComponent(data.date)}`}>Review attendance overview</Link></section> : <AttendanceRegister classId={data.selectedClass?.id || ""} attendanceDate={data.date} students={data.students} />}
      {!data.selectedClass ? <section className="module-card"><strong>No class selected</strong><p>Create a class before opening a daily roster.</p><Link className="button primary" href="/school/classes">Go to classes</Link></section> : null}
    </div>
    <style>{`.attendance-register-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:14px 0}.attendance-summary{display:flex;gap:12px;flex-wrap:wrap;color:var(--color-text-secondary);font-size:10px}.attendance-summary span{padding:8px 10px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-surface-soft)}.attendance-quick-actions{display:flex;gap:7px}.attendance-quick-actions button,.attendance-status-group button{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-secondary);border-radius:8px;padding:7px 9px;font-size:9px;font-weight:800;cursor:pointer}.attendance-status-group{display:flex;gap:5px;flex-wrap:wrap}.attendance-status-group button.chosen{border-color:var(--color-brand);background:var(--color-brand-soft);color:var(--color-brand)}.attendance-status-group button.chosen.absent{color:var(--sn-danger)}.attendance-status-group button.chosen.late{color:var(--sn-warning)}.attendance-status-group button.chosen.excused{color:var(--sn-info)}@media(max-width:700px){.attendance-register-toolbar{display:grid}.attendance-summary{display:grid;grid-template-columns:1fr 1fr}.attendance-quick-actions{justify-content:flex-start}.attendance-status-group{max-width:320px}}`}</style>
  </AppShell>;
}
