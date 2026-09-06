import { AppShell } from "@/components/AppShell";
import { TimetableConstraintsPanel } from "@/components/TimetableConstraintsPanel";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import TimetableWorkspace from "./TimetableWorkspace";
import "./timetable.css";

export default async function TimetablePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [school, teachers, subjects, config] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      getAcademicEngineConfig(tx),
    ]);
    return { school, teachers, subjects, config: config.timetable as { rooms?: Array<{ id: string; name: string; type?: string }>; teacherUnavailability?: Record<string, string[]>; roomRequirements?: Record<string, { roomType?: string; room?: string }>; doublePeriodSubjects?: Record<string, number> } };
  });
  return <AppShell universe="school" title="Timetable" subtitle="Intelligent weekly scheduling." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}><main className="timetable-page"><TimetableWorkspace /><section className="tt-advanced-constraints"><TimetableConstraintsPanel teachers={data.teachers} subjects={data.subjects} initial={{ rooms: data.config.rooms ?? [], teacherUnavailability: data.config.teacherUnavailability ?? {}, roomRequirements: data.config.roomRequirements ?? {}, doublePeriodSubjects: data.config.doublePeriodSubjects ?? {} }} /></section></main></AppShell>;
}
