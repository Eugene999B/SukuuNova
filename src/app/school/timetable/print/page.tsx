import { notFound } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { dayBlocks } from "@/lib/timetable-engine-v2";
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
    const mode: "class" | "teacher" = params.view === "teacher" ? "teacher" : "class";
    const classId = mode === "class" ? (params.classId || classes[0]?.id || "") : "";
    const teacherId = mode === "teacher" ? (params.teacherId || "") : "";
    if (mode === "class" && !classId) return null;
    if (mode === "teacher" && !teacherId) return null;
    const visible = slots.filter((slot) => mode === "class" ? slot.classId === classId : slot.teacherId === teacherId);
    const title = mode === "class" ? (classes.find((item) => item.id === classId)?.name || "Class timetable") : (visible[0]?.teacher.name || "Teacher timetable");
    const config = academic.timetable as Parameters<typeof dayBlocks>[1];
    const days = config.days.filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const blocks = days[0] ? dayBlocks(days[0], config).blocks : [];
    return { school, title, mode, days, blocks, slots: visible, rooms: config.rooms ?? [] };
  });
  if (!data) notFound();
  return <AutoPrintTimetable data={data} />;
}
