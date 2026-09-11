import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import IdentityCardManager from "./IdentityCardManager";

export default async function SchoolIdentityCardsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, canManageCards] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false),
    ]);
    if (!school) throw new Error("School not found.");
    return { school, canManageCards };
  });

  return (
    <AppShell
      universe="school"
      title="School ID Cards"
      subtitle="Issue, print and verify student and staff identity cards."
      active="Students"
      userName={session.name ?? ""}
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      role="ID Card Management"
    >
      {data.canManageCards ? (
        <IdentityCardManager schoolName={data.school.name} />
      ) : (
        <section className="app-card app-panel">
          <div className="app-card-head">
            <div>
              <span className="app-eyebrow">SCHOOL IDENTITY</span>
              <h2>ID card access needs permission</h2>
              <p>Your account is signed in correctly, but it does not currently have the identity-card management permission.</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Ask a school Owner to add <strong>Manage identity cards</strong> to your role, then return here. No student or staff data has been changed.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="button secondary" href="/school/settings/roles">Roles & permissions</Link>
            <Link className="button secondary" href="/school/staff">Staff & teachers</Link>
            <Link className="button secondary" href="/school/students">Students</Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}
