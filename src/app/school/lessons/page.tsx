import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SchoolLessonPlanClassReview } from "@/components/SchoolLessonPlanClassReview";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";

export default async function SchoolLessonsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace === "teacher") redirect("/teacher/lessons");
    if (!(await hasPermission(tx, session.userId, "lesson_plans:review"))) redirect("/dashboard");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return <AppShell
    universe="school"
    title="Lesson Plan Review"
    subtitle="Choose the current term’s class, subject and week, then view the teacher’s file and make the review decision."
    active="Lessons & Planning"
    schoolName={data.school?.name ?? "School Workspace"}
    schoolCode={data.school?.uniqueCode ?? ""}
    userName={session.name}
    role={data.role || "Academic leadership"}
  >
    <SchoolLessonPlanClassReview />
  </AppShell>;
}
