import { notFound } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import AutoPrintTimetable from "./AutoPrintTimetable";

export default async function TimetablePrintPage({ searchParams }: { searchParams: Promise<{ view?: string; classId?: string; teacherId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [school, classes, slots, academic] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.timetableSlot.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }], include: { class: { select: { id: true, name: true, level: true } }, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } } }),
      getAcademicEngineConfig(tx),
    ]);
    if (!school) return null;
    const mode = params.view === "teacher" ? "teacher" : "class";
    const classId = mode === "class" ? (params.classId || classes[0]?.id || "") : "";
    const teacherId = mode === "teacher" ? (params.teacherId || "") : "";
    if (mode === "class" && !classId) return null;
    if (mode === "teacher" && !teacherId) return null;
    const visible = slots.filter((slot) => mode === "class" ? slot.classId === classId : slot.teacherId === teacherId);
    const title = mode === "class" ? (classes.find((item) => item.id === classId)?.name || "Class timetable") : (visible[0]?.teacher.name || "Teacher timetable");
    const config = academic.timetable as { days?: Array<{ dayOfWeek: number; name: string; enabled: boolean; periods?: Array<{ period: number; start: string; end: string }> }>; periods?: Array<{ period: number; start: string; end: string }>; periodsPerDay?: number };
    const days = (config.days || []).filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6);
    const firstDay = days[0];
    const periods = (firstDay?.periods?.length ? firstDay.periods : config.periods?.length ? config.periods : []).slice(0, Math.min(16, config.periodsPerDay || 16));
    return { school, title, mode, days, periods, slots: visible };
  });
  if (!data) notFound();
  return <AutoPrintTimetable data={data} />;
}
