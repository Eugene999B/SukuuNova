import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncDefaultRbac } from "@/lib/role-builder-service";
import AttendanceDisplay from "./AttendanceDisplay";
import "./attendance-display.css";

export default async function AttendanceDisplayPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, async (tx) => {
    await syncDefaultRbac(tx, session.schoolId);
    await requirePermission(tx, session.userId, "attendance:display");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true } });
  });
  if (!school) throw new Error("School not found.");

  return <AttendanceDisplay schoolName={school.name} />;
}
