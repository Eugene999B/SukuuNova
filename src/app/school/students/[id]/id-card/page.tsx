import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function StudentIdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "identity_cards:manage");
    const student = await tx.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true } });
    if (!student) redirect("/school/students");
  });
  redirect("/school/id-cards");
}
