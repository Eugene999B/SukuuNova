import { AppShell } from "@/components/AppShell";
import DownloadsExportCentre from "@/components/DownloadsExportCentre";
import { requireSchoolSession } from "@/lib/school-auth";
import { hasPermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";

export default async function DownloadsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, terms, classes] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, take: 18, select: { id: true, name: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
    ]);
    const permissionByDataset = {students:"exports:students",staff:"exports:staff",attendance:"exports:attendance",fees:"exports:finance",gradebook:"exports:gradebook"};
    const checked=await Promise.all(Object.entries(permissionByDataset).map(async([dataset,permission])=>await hasPermission(tx,session.userId,permission)?dataset:null));
    return { school, terms, classes, allowedDatasets:checked.filter((key):key is string=>key!==null) };
  });

  if (!data.school) return null;

  return (
    <AppShell universe="school" title="Downloads & Exports" subtitle="Official documents and school data exports." active="Reports" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="downloads-simple-shell"><DownloadsExportCentre schoolName={data.school.name} schoolCode={data.school.uniqueCode} logoUrl={data.school.logoUrl} terms={data.terms} classes={data.classes} allowedDatasets={data.allowedDatasets} /></div>
    </AppShell>
  );
}