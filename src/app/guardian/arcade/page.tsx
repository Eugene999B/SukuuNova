import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LearningArcadeV4 from "@/components/LearningArcadeV4";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function LearningArcadePage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="SukuuNova Learning Arcade" subtitle="Original adaptive learning games, missions, rewards and progress." active="Learning Arcade" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><LearningArcadeV4 /></AppShell>;
}
