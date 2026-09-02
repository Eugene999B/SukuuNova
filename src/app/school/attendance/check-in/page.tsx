import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import StaffQrScanner from "./StaffQrScanner";

export default async function StaffQrCheckInPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:view_own");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
  });
  if (!school) throw new Error("School not found.");

  return <AppShell universe="school" title="School Check-In" subtitle="Secure staff attendance using the school's rotating QR code." active="Attendance" userName={session.name ?? ""} schoolName={school.name} schoolCode={school.uniqueCode} role="Staff">
    <StaffQrScanner />
  </AppShell>;
}
