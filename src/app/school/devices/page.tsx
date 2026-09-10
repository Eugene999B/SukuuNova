import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import DevicesDesk from "./DevicesDesk";

export default async function DevicesPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_school");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
  });
  if (!school) throw new Error("School not found.");
  return <AppShell universe="school" title="Attendance Control" subtitle="Devices, live QR, biometrics and attendance rules." active="Devices" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}>
    <div className="devices-simple-shell"><DevicesDesk schoolName={school.name} schoolCode={school.uniqueCode} /></div>
  </AppShell>;
}