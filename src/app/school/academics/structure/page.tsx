import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicStructureWorkspace } from "@/components/AcademicStructureWorkspace";
import { listAcademicStructureTemplates } from "@/lib/academic-structure-templates";
import { getAcademicStructureState } from "@/lib/academic-structure-service";
import { provisionOfficialTemplateClasses } from "@/lib/academic-class-provisioning";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./academic-structure.css";
import "./academic-structure-simple.css";

export default async function AcademicStructurePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    await provisionOfficialTemplateClasses(tx, { schoolId: session.schoolId, actorId: session.userId });
    const [school, academicYears, classes, state, rollovers] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.academicYear.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true }, orderBy: { startDate: "desc" } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true, level: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
      getAcademicStructureState(tx, session.schoolId),
      tx.$queryRawUnsafe<Array<{ id: string; sourceAcademicYearId: string; targetAcademicYearId: string; frameworkId: string; status: string; createdAt: Date; validatedAt: Date | null; committedAt: Date | null; totalItems: number; blockedItems: number; appliedItems: number }>>(
        `SELECT r."id",r."sourceAcademicYearId",r."targetAcademicYearId",r."frameworkId",r."status",r."createdAt",r."validatedAt",r."committedAt",
                COUNT(i."id")::int AS "totalItems",COUNT(i."id") FILTER (WHERE i."status"='blocked')::int AS "blockedItems",COUNT(i."id") FILTER (WHERE i."status"='applied')::int AS "appliedItems"
           FROM "AcademicYearRollover" r LEFT JOIN "AcademicYearRolloverItem" i ON i."schoolId"=r."schoolId" AND i."rolloverId"=r."id"
          WHERE r."schoolId"=$1 GROUP BY r."id" ORDER BY r."createdAt" DESC LIMIT 12`, session.schoolId),
    ]);
    return { school, academicYears, classes, state, rollovers };
  });
  if (!data.school) return null;
  return <AppShell universe="school" title="School Structure" subtitle="Install the school standard once. Its levels become the official classes automatically." active="Academic Settings" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name} role="Academic leadership">
    <div style={{ display: "grid", gap: 12 }}>
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">OFFICIAL CLASS STRUCTURE</span><h2>Install the standard here. Split classes from the Classes workspace.</h2><p>Once a template is installed, its standard levels become the school&apos;s official classes. A level stays as one class unless you open it in Classes and split it into categories such as A, B or C.</p></div><Link href="/school/classes" className="app-action"><strong>Open classes</strong></Link></div></section>
      <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">ANNUAL CLASS RESPONSIBILITY</span><h2>Assign each class section&apos;s head / class teacher</h2><p>Class-teacher responsibility is recorded by academic year so old report cards keep the correct teacher even after staff responsibilities change.</p></div><Link href="/school/academics/structure/class-teachers" className="app-action"><strong>Assign class teachers</strong></Link></div></section>
      <AcademicStructureWorkspace templates={listAcademicStructureTemplates()} initialState={data.state} initialRollovers={data.rollovers.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), validatedAt: item.validatedAt?.toISOString() ?? null, committedAt: item.committedAt?.toISOString() ?? null }))} academicYears={data.academicYears.map((year) => ({ id: year.id, name: year.name, startDate: year.startDate.toISOString(), endDate: year.endDate.toISOString(), isLocked: year.isLocked }))} classes={data.classes} />
    </div>
  </AppShell>;
}
