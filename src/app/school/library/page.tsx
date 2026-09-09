import { AppShell } from "@/components/AppShell";
import LibraryStudio from "@/components/LibraryStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";
import "../school-life-light.css";

export default async function LibraryPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Learning Library" subtitle="Reading, resources, circulation and digital access." active="Library" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><div className="school-life-surface"><LibraryStudio schoolName={school.name}/></div></AppShell>;
}
