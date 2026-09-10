import { AppShell } from "@/components/AppShell";
import SchoolSupportCenter from "@/components/SchoolSupportCenter";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function SchoolSupportPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true },
  }));
  if (!school) throw new Error("School not found.");

  return (
    <AppShell
      universe="school"
      title="Support Center"
      subtitle="Report pilot problems, suggestions and follow-up with SukuuNova Support."
      active="Support Center"
      schoolName={school.name}
      schoolCode={school.uniqueCode}
      userName={session.name}
    >
      <SchoolSupportCenter />
    </AppShell>
  );
}
