import type { TenantDb } from "./db";

export type ClassSubjectOffering = {
  subjectId: string;
  subjectName: string;
  createdAt: Date;
  teachers: Array<{ id: string; name: string }>;
};

type OfferingRow = { subjectId: string; subjectName: string; createdAt: Date };

export async function listClassSubjectOfferings(
  tx: TenantDb,
  schoolId: string,
  classId: string
): Promise<ClassSubjectOffering[]> {
  const offerings = await tx.$queryRaw<OfferingRow[]>`
    SELECT o."subjectId" AS "subjectId", s."name" AS "subjectName", o."createdAt" AS "createdAt"
    FROM "ClassSubjectOffering" o
    INNER JOIN "Subject" s
      ON s."id" = o."subjectId" AND s."schoolId" = o."schoolId"
    WHERE o."schoolId" = ${schoolId} AND o."classId" = ${classId}
    ORDER BY s."name" ASC, s."id" ASC
  `;

  const assignments = await tx.classSubjectTeacher.findMany({
    where: { schoolId, classId },
    select: {
      subjectId: true,
      teacher: { select: { id: true, name: true } },
    },
    orderBy: [{ subjectId: "asc" }, { teacherId: "asc" }],
  });

  const teachersBySubject = new Map<string, Array<{ id: string; name: string }>>();
  for (const assignment of assignments) {
    const teachers = teachersBySubject.get(assignment.subjectId) ?? [];
    teachers.push(assignment.teacher);
    teachersBySubject.set(assignment.subjectId, teachers);
  }

  return offerings.map((offering) => ({
    ...offering,
    teachers: teachersBySubject.get(offering.subjectId) ?? [],
  }));
}

export async function classSubjectOfferingExists(
  tx: TenantDb,
  schoolId: string,
  classId: string,
  subjectId: string
) {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "ClassSubjectOffering"
      WHERE "schoolId" = ${schoolId}
        AND "classId" = ${classId}
        AND "subjectId" = ${subjectId}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

export async function addClassSubjectOffering(
  tx: TenantDb,
  input: { schoolId: string; classId: string; subjectId: string }
) {
  const inserted = await tx.$executeRaw`
    INSERT INTO "ClassSubjectOffering" ("schoolId", "classId", "subjectId")
    VALUES (${input.schoolId}, ${input.classId}, ${input.subjectId})
    ON CONFLICT ("classId", "subjectId") DO NOTHING
  `;
  return inserted > 0;
}

export async function removeClassSubjectOffering(
  tx: TenantDb,
  input: { schoolId: string; classId: string; subjectId: string }
) {
  return tx.$executeRaw`
    DELETE FROM "ClassSubjectOffering"
    WHERE "schoolId" = ${input.schoolId}
      AND "classId" = ${input.classId}
      AND "subjectId" = ${input.subjectId}
  `;
}
