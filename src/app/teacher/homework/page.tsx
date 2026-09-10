import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";

/**
 * Keep the historical /teacher/homework URL working while routing teachers to the
 * single advanced authoring surface. This removes the old modal-based homework
 * form so homework, quizzes and online activities use one canonical engine.
 */
export default async function TeacherHomeworkPage() {
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
  });
  redirect("/teacher/studio#activities");
}
