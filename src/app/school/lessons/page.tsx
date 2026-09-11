import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import SchoolLessonReviewWorkspaceV2 from "@/components/SchoolLessonReviewWorkspaceV2";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import "./lesson-review-v2.css";

export default async function SchoolLessonsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace === "teacher") redirect("/teacher/lessons");
    if (!(await hasPermission(tx, session.userId, "lesson_plans:review"))) redirect("/dashboard");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return <AppShell universe="school" title="Learning Plan Verification" subtitle="Review curriculum alignment, Ghana learning-planner structure and teaching evidence before approval." active="Lessons & Planning" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Academic leadership"}><SchoolLessonReviewWorkspaceV2/></AppShell>;
}
