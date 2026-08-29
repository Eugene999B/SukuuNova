import { AppShell } from "@/components/AppShell";
import SchoolLifeStudio from "@/components/SchoolLifeStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function LibraryPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Learning Library" subtitle="Discover, manage, read and share school learning materials." active="Library" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><SchoolLifeStudio module="library" schoolName={school.name} userName={session.name} schoolId={session.schoolId} /></AppShell>;
}
