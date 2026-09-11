import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { createStudentAction } from "../actions";
import "@/app/school/students/students-workspace.css";
import "@/components/students/add-student-dialog.css";
import "@/app/school/students/students-light-overrides.css";

export default async function CreateStudentPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, academicYears, terms] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, _count: { select: { students: true } } } }),
      tx.academicYear.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: { select: { name: true } } }, orderBy: { startDate: "desc" } }),
    ]);
    const now = new Date();
    return {
      school,
      classes,
      academicYears: academicYears.map((year) => ({ id: year.id, name: year.name, isCurrent: year.startDate <= now && year.endDate >= now })),
      terms: terms.map((term) => ({ id: term.id, name: term.name, academicYearName: term.academicYear.name, isCurrent: term.startDate <= now && term.endDate >= now, isLocked: term.isLocked })),
    };
  });

  return <AppShell universe="school" title="Add student" subtitle="Guided learner admission" active="Students" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}><div style={{ minHeight: "calc(100vh - 120px)", display: "grid", placeItems: "center", padding: "24px" }}><AddStudentDialog classes={data.classes} academicYears={data.academicYears} terms={data.terms} action={createStudentAction} initialOpen /></div></AppShell>;
}
