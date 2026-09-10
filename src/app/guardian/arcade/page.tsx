import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LearningArcadeV2 from "@/components/LearningArcadeV2";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function LearningArcadePage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="Nova Playroom" subtitle="Adaptive learning missions, rewards, progress and animated challenges." active="Academics" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><LearningArcadeV2 /></AppShell>;
}
