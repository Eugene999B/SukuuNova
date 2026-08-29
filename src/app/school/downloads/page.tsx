import { AppShell } from "@/components/AppShell";
import DownloadsExportCentre from "@/components/DownloadsExportCentre";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function DownloadsPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true, logoUrl: true },
  }));

  if (!school) {
    return null;
  }

  return (
    <AppShell
      universe="school"
      title="Downloads & Exports"
      subtitle="Create clean, school-ready copies of the information you are authorised to access."
      active="Reports"
      schoolName={school.name}
      schoolCode={school.uniqueCode}
      userName={session.name}
    >
      <DownloadsExportCentre schoolName={school.name} schoolCode={school.uniqueCode} logoUrl={school.logoUrl} />
    </AppShell>
  );
}
