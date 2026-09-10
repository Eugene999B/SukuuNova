import { AppShell } from "@/components/AppShell";
import PilotCertificationPanel from "@/components/PilotCertificationPanel";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import "@/components/pilot-certification.css";

export default async function PilotCertificationPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  const canReview = await hasPlatformPermission(session, "settings.manage");

  return (
    <AppShell
      universe="platform"
      title="Pilot Certification"
      subtitle="Evidence-based launch gates for each SukuuNova pilot school."
      active="Pilot Certification"
      userName={session.name}
      role={session.role}
    >
      <PilotCertificationPanel canReview={canReview} />
    </AppShell>
  );
}
