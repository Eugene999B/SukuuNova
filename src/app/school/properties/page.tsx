import { AppShell } from "@/components/AppShell";
import SchoolPropertiesWorkspace from "@/components/SchoolPropertiesWorkspace";
import { requireSchoolSession } from "@/lib/auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { schoolPropertyAccess } from "@/lib/school-properties-service";
import { ForbiddenError } from "@/lib/errors";

export default async function SchoolPropertiesPage() {
  const session = await requireSchoolSession();
  const context = await withTenant(session.schoolId, async (tx) => {
    const propertyAccess = await schoolPropertyAccess(tx, session.userId);
    if (!propertyAccess.view) throw new ForbiddenError("You do not have access to school properties.");
    const [school, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolAuthorization(tx, session.userId),
    ]);
    return { school, role: access.roles.map((role) => role.name).join(" · ") || "School account" };
  });
  if (!context.school) return null;
  return <AppShell universe="school" title="School Properties" subtitle="Locations, custody, condition and movement." active="School Properties" schoolName={context.school.name} schoolCode={context.school.uniqueCode} userName={session.name} role={context.role}>
    <SchoolPropertiesWorkspace />
  </AppShell>;
}
