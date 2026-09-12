import { ClinicShell } from "@/components/ClinicShell";
import ClinicNurseWorkspace from "@/components/ClinicNurseWorkspace";
import { requireSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./clinic.css";

export default async function ClinicPage() {
  const session = await requireSchoolSession();
  const context = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "clinic:care");
    const [school, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolAuthorization(tx, session.userId),
    ]);
    return { school, role: access.roles.map((role) => role.name).join(" · ") || "Clinic staff" };
  });
  if (!context.school) return null;

  return <ClinicShell schoolName={context.school.name} schoolCode={context.school.uniqueCode} userName={session.name} role={context.role}>
    <ClinicNurseWorkspace />
  </ClinicShell>;
}
