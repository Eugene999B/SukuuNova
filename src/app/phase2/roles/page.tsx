import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { customRoleBuilderData } from "@/lib/role-builder-service";
import { RoleBuilder } from "@/components/RoleBuilder";

export default async function CustomRolesPage() {
  const session = await requireSchoolSession().catch(() => null);
  if (!session) redirect("/login/school");
  const data = await withTenant(session.schoolId, (tx) =>
    customRoleBuilderData(tx, session.userId)
  ).catch(() => null);
  if (!data) redirect("/phase2");
  return <RoleBuilder initial={data} />;
}
