import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { HousesDirectory } from "./HousesDirectory";
import "../classes/classes-houses.css";

export default async function HousesPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, houses, learners] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.$queryRaw<Array<{ id: string; name: string; code: string; color: string | null; description: string | null; isActive: boolean; studentCount: number }>>`SELECT h."id",h."name",h."code",h."color",h."description",h."isActive",COUNT(s."id")::int AS "studentCount" FROM "House" h LEFT JOIN "Student" s ON s."houseId"=h."id" AND s."schoolId"=h."schoolId" AND s."status"='active' WHERE h."schoolId"=${session.schoolId} GROUP BY h."id",h."name",h."code",h."color",h."description",h."isActive" ORDER BY h."name" ASC`,
      tx.$queryRaw<Array<{ id: string; name: string; admissionNo: string; className: string | null; houseId: string | null; houseName: string | null }>>`SELECT s."id",s."name",s."admissionNo",c."name" AS "className",s."houseId",h."name" AS "houseName" FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" LEFT JOIN "House" h ON h."id"=s."houseId" AND h."schoolId"=s."schoolId" WHERE s."schoolId"=${session.schoolId} AND s."status"='active' ORDER BY s."name" ASC LIMIT 1000`,
    ]);
    return { school, houses, learners };
  });
  const houses = data.houses.map((house) => ({ id: house.id, name: house.name, code: house.code, color: house.color, description: house.description, active: house.isActive, students: house.studentCount }));
  return <AppShell universe="school" title="Houses" subtitle="Pastoral groups across the school community." active="Houses" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <HousesDirectory houses={houses} learners={data.learners} />
  </AppShell>;
}
