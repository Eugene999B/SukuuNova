import { notFound, redirect } from "next/navigation";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { getGuardianFamilyContext } from "@/lib/guardian-family-context";
import { withTenant } from "@/lib/db";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { safeDayBlocks } from "@/lib/timetable-bell-schedule";
import { readTimetableExtensions } from "@/lib/timetable-generation-policy";
import AutoPrintTimetable from "@/app/school/timetable/print/AutoPrintTimetable";
import "../../../school/timetable/print/print.css";

export default async function GuardianTimetablePrintPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const studentId = (await searchParams).studentId?.trim() || null;

  const data = await withTenant(session.schoolId, async (tx) => {
    const family = await getGuardianFamilyContext(tx, {
      schoolId: session.schoolId,
      guardianId: session.guardianId,
      userId: session.userId,
      studentId,
    });
    const selected = family.selectedChild ?? family.children[0] ?? null;
    if (!selected?.classId) return null;

    const [school, slots, academic, rawSettings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.timetableSlot.findMany({
        where: { schoolId: session.schoolId, classId: selected.classId },
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
    if (!school) return null;

    const config = academic.timetable;
    const days = config.days.filter((day) => day.enabled && day.dayOfWeek >= 1 && day.dayOfWeek <= 6).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const blocksByDay = Object.fromEntries(days.map((day) => [day.dayOfWeek, safeDayBlocks(day, config).blocks]));
    const { printTheme } = readTimetableExtensions(rawSettings?.timetableConfig);
    return {
      school,
      title: `${selected.className || "Class timetable"} · ${selected.name}`,
      mode: "class" as const,
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
