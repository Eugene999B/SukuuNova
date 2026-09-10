import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";
import { schoolWorkspaceRedirect } from "@/lib/workspace-boundary";

/**
 * Hard boundary between the school administration universe and pure teacher accounts.
 *
 * API routes keep their own permission checks. This layout protects every rendered
 * /school page so a pure Class/Subject/Teacher account can never fall into an owner/
 * administrator shell simply by following an old link or typing a school URL.
 */
export default async function SchoolWorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSchoolSession();
  const workspace = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    return access.workspace;
  });

  const destination = schoolWorkspaceRedirect(workspace);
  if (destination) redirect(destination);
  return children;
}
