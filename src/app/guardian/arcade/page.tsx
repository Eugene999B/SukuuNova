import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LearningArcadeV5 from "@/components/LearningArcadeV5";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function LearningArcadePage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="SukuuNova Learning Arcade" subtitle="Distinct adaptive game worlds with levels, rewards, rankings, sound and player-controlled fullscreen." active="Learning Arcade" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><LearningArcadeV5 /></AppShell>;
}
