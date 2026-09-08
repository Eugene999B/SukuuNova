import { AppShell } from "@/components/AppShell";
import DownloadsExportCentre from "@/components/DownloadsExportCentre";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function DownloadsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, terms, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, take: 18, select: { id: true, name: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
    ]);
    return { school, terms, classes };
  });

  if (!data.school) return null;

  return (
    <AppShell universe="school" title="Downloads & Exports" subtitle="Official documents, PDF printing and school data exports." active="Reports" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <DownloadsExportCentre schoolName={data.school.name} schoolCode={data.school.uniqueCode} logoUrl={data.school.logoUrl} terms={data.terms} classes={data.classes} />
    </AppShell>
  );
}
