import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import GuardianLibraryHub from "@/components/GuardianLibraryHub";
import { requireGuardianSession } from "@/lib/guardian-auth";

export default async function GuardianLibraryPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  return <AppShell universe="guardian" title="Library & Resources" subtitle="Read, continue and discover approved learning resources." active="Library & Resources" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><GuardianLibraryHub /></AppShell>;
}
