import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncDefaultRbac } from "@/lib/role-builder-service";
import AttendanceDisplay from "./AttendanceDisplay";

export default async function AttendanceDisplayPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await syncDefaultRbac(tx, session.schoolId);
    await requirePermission(tx, session.userId, "attendance:display");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true } });
  });
  if (!school) throw new Error("School not found.");

  return <>
    <div className="hidden lg:block">
      <AppShell universe="school" title="Staff Check-In Display" subtitle="Secure rotating QR code for the school's designated attendance screen." active="Attendance" userName={session.name ?? ""} schoolName={school.name} schoolCode="" role="Attendance Display">
        <div className="-mx-4 -my-4 lg:-mx-6 lg:-my-6"><AttendanceDisplay schoolName={school.name} /></div>
      </AppShell>
    </div>
    <div className="lg:hidden"><AttendanceDisplay schoolName={school.name} /></div>
  </>;
}
