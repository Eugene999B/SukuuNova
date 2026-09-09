import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";

export type GuardianFamilyChild = {
  id: string;
  name: string;
  admissionNo: string;
  status: string;
  classId: string | null;
  className: string | null;
  classLevel: string | null;
  relationship: string;
  isPrimary: boolean;
};

export async function getGuardianFamilyContext(tx: TenantDb, input: {
  schoolId: string;
  guardianId: string;
  userId: string;
  studentId?: string | null;
}) {
  const guardian = await tx.guardian.findFirst({
    where: { id: input.guardianId, schoolId: input.schoolId, userId: input.userId },
    select: {
      id: true,
      name: true,
      students: {
        select: {
          relationship: true,
          isPrimary: true,
          student: {
            select: {
              id: true,
              name: true,
              admissionNo: true,
              status: true,
              classId: true,
              class: { select: { name: true, level: true } },
            },
          },
        },
      },
    },
  });
  if (!guardian) throw new ForbiddenError("This guardian account is no longer linked to the school.");

  const children = Array.from(new Map(guardian.students.map((link) => [link.student.id, {
    id: link.student.id,
    name: link.student.name,
    admissionNo: link.student.admissionNo,
    status: link.student.status,
    classId: link.student.classId,
    className: link.student.class?.name ?? null,
    classLevel: link.student.class?.level ?? null,
    relationship: link.relationship,
    isPrimary: link.isPrimary,
  }])).values()).sort((a, b) => a.name.localeCompare(b.name));

  const selectedStudentId = input.studentId?.trim() || null;
  const selectedChild = selectedStudentId ? children.find((child) => child.id === selectedStudentId) ?? null : null;
  if (selectedStudentId && !selectedChild) throw new ForbiddenError("You can only view learners linked to this guardian account.");

  return {
    guardian: { id: guardian.id, name: guardian.name },
    children,
    selectedChild,
    selectedStudentId,
  };
}
