import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LearningArcade from "@/components/LearningArcade";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function LearningArcadePage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="Learning Arcade" subtitle="Small challenges. Real learning progress." active="Academics" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><LearningArcade /></AppShell>;
}
