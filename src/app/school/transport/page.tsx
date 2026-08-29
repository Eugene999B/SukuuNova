import { AppShell } from "@/components/AppShell";
import SchoolLifeStudio from "@/components/SchoolLifeStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";
import "../school-life-light.css";

export default async function TransportPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Transport Command Centre" subtitle="Routes, fleet, boarding, safety and parent visibility." active="Transport" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><div className="school-life-surface"><SchoolLifeStudio module="transport" schoolName={school.name} userName={session.name} schoolId={session.schoolId} /></div></AppShell>;
}
