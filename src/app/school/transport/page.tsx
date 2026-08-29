import { AppShell } from "@/components/AppShell";
import SchoolOperationsStudio from "@/components/SchoolOperationsStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function TransportPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Transport Command Centre" subtitle="Routes, fleet, boarding, safety and parent visibility." active="Transport" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><SchoolOperationsStudio module="transport" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name} schoolId={session.schoolId} /></AppShell>;
}
