import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import TimetableSetupWorkspace from "./TimetableSetupWorkspace";
import "./timetable-setup.css";

export default async function TimetableSetupPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    return tx.school.findUnique({
      where: { id: session.schoolId },
      select: { name: true, uniqueCode: true, logoUrl: true },
    });
  });

  return (
    <AppShell
      universe="school"
      title="Timetable Setup"
      subtitle="Set the school week, periods, breaks and weekly subject lessons before generating the official timetable."
      active="Timetable"
      schoolName={school?.name ?? "School Workspace"}
      schoolCode={school?.uniqueCode ?? ""}
      userName={session.name}
    >
      <TimetableSetupWorkspace hasSchoolLogo={Boolean(school?.logoUrl)} />
    </AppShell>
  );
}
