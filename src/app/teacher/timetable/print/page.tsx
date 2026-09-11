import { notFound, redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { safeDayBlocks } from "@/lib/timetable-bell-schedule";
import { readTimetableExtensions } from "@/lib/timetable-generation-policy";
import AutoPrintTimetable from "@/app/school/timetable/print/AutoPrintTimetable";
import "../../../school/timetable/print/print.css";

export default async function TeacherTimetablePrintPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");

    const [school, teacher, slots, academic, rawSettings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.user.findFirst({ where: { id: session.userId, schoolId: session.schoolId }, select: { name: true } }),
      tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, teacherId: session.userId },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        include: {
          class: { select: { id: true, name: true, level: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      }),
      getAcademicEngineConfig(tx, session.schoolId),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timetableConfig: true } }),
    ]);
    if (!school || !teacher) return null;

    const config = academic.timetable;
    const days = config.days.filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const blocksByDay = Object.fromEntries(days.map((day) => [day.dayOfWeek, safeDayBlocks(day, config).blocks]));
    const { printTheme } = readTimetableExtensions(rawSettings?.timetableConfig);
    return {
      school,
      title: `${teacher.name} · Teaching timetable`,
      mode: "teacher" as const,
      days,
      blocksByDay,
      slots,
      rooms: config.rooms ?? [],
      printTheme,
    };
  });

  if (!data) notFound();
  return <AutoPrintTimetable data={data} />;
}
