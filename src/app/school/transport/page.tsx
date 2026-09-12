import { AppShell } from "@/components/AppShell";
import TransportControlRoom from "@/components/TransportControlRoom";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function TransportPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell
    universe="school"
    title="Transport Control Room"
    subtitle="Live fleet, certified trackers, route operations, safety and family pickup visibility."
    active="Transport"
    schoolName={school.name}
    schoolCode={school.uniqueCode}
    userName={session.name}
  ><TransportControlRoom/></AppShell>;
}
