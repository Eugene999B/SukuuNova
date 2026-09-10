import { AppShell } from "@/components/AppShell";
import SchoolImportCenter from "@/components/SchoolImportCenter";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function SchoolImportPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true },
  }));
  if (!school) throw new Error("School not found.");

  return (
    <AppShell
      universe="school"
      title="Data Import"
      subtitle="Stage, map and validate school data before any production write."
      active="Data Import"
      schoolName={school.name}
      schoolCode={school.uniqueCode}
      userName={session.name}
    >
      <SchoolImportCenter />
    </AppShell>
  );
}
