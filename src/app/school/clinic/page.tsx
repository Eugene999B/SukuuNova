import { AppShell } from "@/components/AppShell";
import ClinicManagementWorkspace from "@/components/ClinicManagementWorkspace";
import { requireSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "../../clinic/clinic.css";

export default async function SchoolClinicPage() {
  const session = await requireSchoolSession();
  const context = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "clinic:overview");
    const [school, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolAuthorization(tx, session.userId),
    ]);
    return { school, role: access.roles.map((role) => role.name).join(" · ") || "School leadership" };
  });
  if (!context.school) return null;

  return <AppShell
    universe="school"
    title="Clinic"
    subtitle="School health intelligence, medicine readiness and nurse access."
    active="Clinic"
    schoolName={context.school.name}
    schoolCode={context.school.uniqueCode}
    userName={session.name}
    role={context.role}
  >
    <ClinicManagementWorkspace />
  </AppShell>;
}
