import { unstable_cache } from "next/cache";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { ClassesHousesWorkspace } from "./ClassesHousesWorkspace";
import "./classes-houses.css";

const TEACHER_ROLE_KEYS = ["teacher", "class-teacher", "subject-teacher", "assistant-teacher", "teaching-assistant"];

async function readClassesWorkspace(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const [school, classes, teachers, houses, learners] = await Promise.all([
      tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, classTeacher: { select: { id: true, name: true } }, _count: { select: { students: true, subjectAssignments: true, timetableSlots: true } } } }),
      tx.user.findMany({ where: { schoolId, status: "active", userRoles: { some: { role: { key: { in: TEACHER_ROLE_KEYS } } } } }, orderBy: { name: "asc" }, select: { id: true, name: true, classTeacherFor: { select: { id: true, name: true } } } }),
      tx.$queryRaw<Array<{ id: string; name: string; code: string; color: string | null; description: string | null; isActive: boolean; studentCount: number }>>`SELECT h."id",h."name",h."code",h."color",h."description",h."isActive",COUNT(s."id")::int AS "studentCount" FROM "House" h LEFT JOIN "Student" s ON s."houseId"=h."id" AND s."schoolId"=h."schoolId" AND s."status"='active' WHERE h."schoolId"=${schoolId} GROUP BY h."id",h."name",h."code",h."color",h."description",h."isActive" ORDER BY h."name" ASC`,
      tx.$queryRaw<Array<{ id: string; name: string; admissionNo: string; className: string | null; classLevel: string | null; houseId: string | null; houseName: string | null }>>`SELECT s."id",s."name",s."admissionNo",c."name" AS "className",c."level" AS "classLevel",h."id" AS "houseId",h."name" AS "houseName" FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" LEFT JOIN "House" h ON h."id"=s."houseId" AND h."schoolId"=s."schoolId" WHERE s."schoolId"=${schoolId} AND s."status"='active' ORDER BY s."name" ASC LIMIT 300`,
    ]);
    return { school, classes, teachers, houses, learners };
  });
}

const getCachedClassesWorkspace = (schoolId: string) => unstable_cache(
  () => readClassesWorkspace(schoolId),
  ["sukuunova", "classes-workspace", schoolId],
  { revalidate: 60 }
)();

export default async function ClassesPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    return tx.school.findUnique({ where: { id: session.schoolId }, select: { id: true } });
  });
  if (!data) throw new Error("School not found.");
  const workspace = await getCachedClassesWorkspace(session.schoolId);
  const classRows = workspace.classes.map((item) => ({ id: item.id, name: item.name, level: item.level, teacher: item.classTeacher, students: item._count.students, subjects: item._count.subjectAssignments, timetable: item._count.timetableSlots }));
  const teacherRows = workspace.teachers.map((item) => ({ id: item.id, name: item.name, currentClass: item.classTeacherFor[0]?.name ?? null }));
  const houseRows = workspace.houses.map((item) => ({ id: item.id, name: item.name, code: item.code, color: item.color, description: item.description, active: item.isActive, students: item.studentCount }));
  return <AppShell universe="school" title="Classes & Houses" subtitle="Build the academic structure and manage the cross-school house community from one workspace." active="Classes & Houses" schoolName={workspace.school?.name ?? "School Workspace"} schoolCode={workspace.school?.uniqueCode ?? ""} userName={session.name}>
    <ClassesHousesWorkspace classes={classRows} teachers={teacherRows} houses={houseRows} learners={workspace.learners} schoolName={workspace.school?.name ?? "School Workspace"} />
  </AppShell>;
}
