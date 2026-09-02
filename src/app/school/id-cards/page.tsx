import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import IdentityCardManager from "./IdentityCardManager";

export default async function SchoolIdentityCardsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "identity_cards:manage");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    if (!school) throw new Error("School not found.");
    return school;
  });
  return (
    <AppShell universe="school" title="School ID Cards" subtitle="Issue, verify and print secure identification cards for students and staff." active="Students" userName={session.name ?? ""} schoolName={data.name} schoolCode={data.uniqueCode} role="ID Card Management">
      <IdentityCardManager schoolName={data.name} />
    </AppShell>
  );
}
