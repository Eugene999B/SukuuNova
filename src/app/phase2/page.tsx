import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { Phase2Console } from "@/components/Phase2Console";

export default async function Phase2Page() {
  const session = await requireSchoolSession().catch(() => null);
  if (!session) redirect("/login/school");
  const canManageRoles = await withTenant(session.schoolId, (tx) =>
    hasPermission(tx, session.userId, "roles:create_custom")
  );
  return <Phase2Console name={session.name} canManageRoles={canManageRoles} />;
}
