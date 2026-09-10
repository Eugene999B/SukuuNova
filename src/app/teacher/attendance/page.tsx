import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherAttendanceRegister from "@/components/TeacherAttendanceRegister";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-attendance.css";
import "./teacher-attendance-v4.css";

export default async function TeacherAttendancePage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    const permitted = (await access.can("attendance:record_assigned")) || (await access.can("attendance:record_all"));
    if (!permitted) redirect("/teacher");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return <AppShell universe="teacher" title="Class Attendance" subtitle="Tick Present or Absent for the class, then submit once. Verified device arrivals appear automatically." active="My Attendance" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}><TeacherAttendanceRegister/></AppShell>;
}
