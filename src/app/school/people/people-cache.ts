import { cacheTenantRead } from "@/lib/server-cache";

export function getPeopleSnapshot(schoolId: string) {
  return cacheTenantRead(
    ["sukuuNova", "people", "overview", schoolId],
    async () => {
      const { withTenant } = await import("@/lib/db");
      return withTenant(schoolId, async (tx) => {
        const [studentCount, activeStudentCount, guardians, users, classes, unassigned, recentStudents] = await Promise.all([
          tx.student.count(),
          tx.student.count({ where: { status: "active" } }),
          tx.guardian.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, userId: true, students: { select: { student: { select: { id: true, name: true } } } } } }),
          tx.user.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, phone: true, userRoles: { select: { role: { select: { name: true } } } }, guardianProfiles: { select: { id: true } } } }),
          tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], take: 12, select: { id: true, name: true, level: true, classTeacher: { select: { name: true } }, _count: { select: { students: true, subjectAssignments: true } } } }),
          tx.student.count({ where: { classId: null, status: "active" } }),
          tx.student.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, admissionNo: true, status: true, class: { select: { name: true, level: true } } } }),
        ]);
        return { studentCount, activeStudentCount, recentStudents, guardians, users, classes, unassigned };
      });
    },
    30,
    [`sukuunova:people:${schoolId}`],
  );
}
