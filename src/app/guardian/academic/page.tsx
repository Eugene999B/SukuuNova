import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import GuardianAcademicWorkspace from "@/components/GuardianAcademicWorkspace";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function GuardianAcademicPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="Academic workspace" subtitle="Assignments, results and teacher notes" active="Academics" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><GuardianAcademicWorkspace /></AppShell>;
}
