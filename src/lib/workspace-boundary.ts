export type SchoolWorkspaceKind = "school" | "teacher" | string;

/**
 * Pure navigation policy used by rendered school administration routes.
 * A teacher workspace is intentionally unable to render /school pages, even when
 * an old bookmark or UI bug points there.
 */
export function schoolWorkspaceRedirect(workspace: SchoolWorkspaceKind) {
  return workspace === "teacher" ? "/teacher" : null;
}

/** Teacher pages are for teacher-workspace identities only. */
export function teacherWorkspaceRedirect(workspace: SchoolWorkspaceKind, isTeacher: boolean) {
  return workspace === "teacher" && isTeacher ? null : "/dashboard";
}
