import { redirect } from "next/navigation";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

type Props = { searchParams: Promise<{ view?: string }> };

const destination: Record<string, string> = {
  "My Attendance": "/teacher/attendance",
  "My Homework": "/teacher/studio#activities",
  "My Gradebook": "/teacher/gradebook",
  "My Timetable": "/teacher/timetable",
  "My Classes": "/teacher/students",
  "My Lessons & Planning": "/teacher/studio#notes",
  "My Assessments": "/teacher/studio#activities",
  "My Messages": "/teacher/messages",
  "Class Announcements": "/teacher/announcements",
};

/**
 * Legacy compatibility route. The old generic teacher module rendered placeholder
 * content and could encourage links back into school administration. Keep old
 * bookmarks working, but immediately send the teacher to a real teacher-owned page.
 */
export default async function TeacherModulePage({ searchParams }: Props) {
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
  });
  const { view } = await searchParams;
  redirect(destination[view || ""] || "/teacher");
}
