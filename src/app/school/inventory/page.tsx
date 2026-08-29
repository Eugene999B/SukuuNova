import { AppShell } from "@/components/AppShell";
import SchoolLifeStudio from "@/components/SchoolLifeStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function InventoryPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Assets & Inventory" subtitle="Track assets, stock, custody, maintenance and retirement." active="Assets & Inventory" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><SchoolLifeStudio module="inventory" schoolName={school.name} userName={session.name} schoolId={session.schoolId} /></AppShell>;
}
