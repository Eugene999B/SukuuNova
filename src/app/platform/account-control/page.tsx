import { AppShell } from "@/components/AppShell";
import PlatformAccountControlCenter from "@/components/PlatformAccountControlCenter";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformOverview } from "@/lib/platform-admin-service";
import { getScopedPlatformOverview } from "@/lib/platform-scoped-overview";
import { getPlatformSchoolScope, hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";

export const dynamic = "force-dynamic";

export default async function PlatformAccountControlPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const schoolScope = await getPlatformSchoolScope(session);
  const overview = schoolScope === null ? await getPlatformOverview() : await getScopedPlatformOverview(session);
  const [canSecurity, canSupport] = await Promise.all([
    hasPlatformPermission(session, "security.manage"),
    hasPlatformPermission(session, "support.manage"),
  ]);
  const schools = overview.schools.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string") return [];
    return [{
      id: row.id,
      name: typeof row.name === "string" ? row.name : "School",
      uniqueCode: typeof row.uniqueCode === "string" ? row.uniqueCode : null,
      status: typeof row.status === "string" ? row.status : "unknown",
    }];
  });

  return (
    <AppShell
      universe="platform"
      title="Account Control"
      subtitle="Select a school, find an account and resolve access, password and session problems from one audited support workspace."
      active="Account Control"
      userName={session.name}
      role={session.role}
    >
      <PlatformAccountControlCenter schools={schools} canSecurity={canSecurity} canSupport={canSupport} />
    </AppShell>
  );
}
