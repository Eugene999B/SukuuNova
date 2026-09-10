import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";
import { teacherWorkspaceRedirect } from "@/lib/workspace-boundary";

/**
 * Teacher pages form a separate operating universe from school administration.
 * Centralizing this at the route layout means every current and future /teacher
 * page inherits the same identity boundary instead of relying on each page author
 * to remember a guard.
 */
export default async function TeacherWorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSchoolSession();
  const boundary = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    return { workspace: access.workspace, isTeacher: access.isTeacher };
  });

  const destination = teacherWorkspaceRedirect(boundary.workspace, boundary.isTeacher);
  if (destination) redirect(destination);
  return children;
}
