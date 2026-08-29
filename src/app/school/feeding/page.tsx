import { AppShell } from "@/components/AppShell";
import SchoolLifeStudio from "@/components/SchoolLifeStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function FeedingPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Feeding & Catering" subtitle="Menus, service, budgets, costs and meal communication." active="Feeding" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><div className="school-life-surface"><SchoolLifeStudio module="feeding" schoolName={school.name} userName={session.name} schoolId={session.schoolId} /></div></AppShell>;
}
