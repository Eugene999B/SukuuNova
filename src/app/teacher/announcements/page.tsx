import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherAnnouncementsDesk from "@/components/TeacherAnnouncementsDesk";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-announcements.css";

export default async function TeacherAnnouncementsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });
  return <AppShell universe="teacher" title="Class Announcements" subtitle="Targeted class communication without leaving your teaching scope." active="Class Announcements" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}><TeacherAnnouncementsDesk/></AppShell>;
}
