import { AppShell } from "@/components/AppShell";
import { TermCompletionControlRoom } from "@/components/TermCompletionControlRoom";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function TermCompletionPage() {
  const session = await requireSchoolSession();
  const now = new Date();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "calendar:manage");
    const [school, terms] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.term.findMany({
        where: { schoolId: session.schoolId },
        select: { id: true, name: true, startDate: true, endDate: true, isLocked: true },
        orderBy: { startDate: "desc" },
        take: 12,
      }),
    ]);
    return { school, terms };
  });

  if (!data.school) return null;
  const terms = data.terms.map((term) => ({
    id: term.id,
    name: term.name,
    startDate: term.startDate.toISOString(),
    endDate: term.endDate.toISOString(),
    isLocked: term.isLocked,
  }));
  const initial = terms.find((term) => !term.isLocked && new Date(term.endDate) < now)
    ?? terms.find((term) => !term.isLocked && new Date(term.startDate) <= now && new Date(term.endDate) >= now)
    ?? terms[0];

  return <AppShell
    universe="school"
    title="Term Completion"
    subtitle="Resolve academic readiness before leadership closes a term."
    active="Terms & Calendar"
    schoolName={data.school.name}
    schoolCode={data.school.uniqueCode}
    userName={session.name}
  >
    <TermCompletionControlRoom terms={terms} initialTermId={initial?.id ?? ""} nowIso={now.toISOString()} />
  </AppShell>;
}
