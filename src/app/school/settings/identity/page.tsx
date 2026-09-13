import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { readSchoolDocumentIdentity } from "@/lib/report-card-v2";
import SchoolIdentityEditor from "./SchoolIdentityEditor";

export default async function SchoolIdentitySettingsPage() {
  const session = await requireSchoolSession();
  const identity = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_school");
    return readSchoolDocumentIdentity(tx, session.schoolId);
  });
  return (
    <AppShell
      universe="school"
      title="School Identity & Branding"
      subtitle="The official institutional identity printed on reports and school documents."
      active="Settings Home"
      schoolName={identity.name}
      schoolCode={identity.uniqueCode}
      userName={session.name}
    >
      <SchoolIdentityEditor initial={identity} />
    </AppShell>
  );
}
