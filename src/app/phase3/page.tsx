import { redirect } from "next/navigation";
import { getSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { Phase3Console } from "@/components/Phase3Console";

export default async function Phase3Page() {
  const session = await getSchoolSession();
  if (!session) redirect("/login/school");
  const account = await withTenant(session.schoolId, (tx) =>
    tx.user.findUnique({
      where: { id: session.userId },
      select: { name: true }
    })
  );
  if (!account) redirect("/login/school");
  return <Phase3Console name={account.name} />;
}
