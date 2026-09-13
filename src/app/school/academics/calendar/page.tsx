import { AppShell } from "@/components/AppShell";
import AcademicCalendarWorkspace from "@/components/AcademicCalendarWorkspace";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./academic-calendar.css";

export default async function AcademicCalendarPage() {
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, (tx) => requirePermission(tx, session.userId, "calendar:manage"));
  return <AppShell
    universe="school"
    title="Academic Year Planner"
    subtitle="Plan sessions, vacations, instructional days, closing windows and year-end review."
    active="Academic Settings"
    userName={session.name}
  >
    <AcademicCalendarWorkspace />
  </AppShell>;
}
