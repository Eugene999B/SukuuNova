import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherAcademicStudioV4 from "@/components/TeacherAcademicStudioV4";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-studio-v4.css";

export default async function TeacherStudioPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    const allowed = (await access.can("scores:write:assigned")) || (await access.can("scores:write:all"));
    if (!allowed) redirect("/teacher");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return (
    <AppShell universe="teacher" title="Teaching Studio" subtitle="Create work, build questions, mark learners and review submissions inside your assigned teaching scope." active="Teaching Studio" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <TeacherAcademicStudioV4 />
    </AppShell>
  );
}
