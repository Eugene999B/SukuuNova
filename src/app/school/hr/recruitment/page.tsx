import { AppShell } from "@/components/AppShell";
import SchoolOperationsStudio from "@/components/SchoolOperationsStudio";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function RecruitmentPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, tx => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) notFound();
  return <AppShell universe="school" title="Talent & Recruitment" subtitle="Vacancies, applicants, screening, interviews and offers." active="Recruitment" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><SchoolOperationsStudio module="recruitment" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name} schoolId={session.schoolId} /></AppShell>;
}
