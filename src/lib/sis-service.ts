import { hash } from "bcryptjs";
import { appendSchoolAudit } from "./audit";
import { withTenant, type TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";

export async function registerStudent(input: {
  schoolId: string; actorId: string; admissionNo: string; name: string;
  dob?: Date; classId?: string; photoUrl?: string;
  guardian?: { name: string; phone: string; relationship: string; isPrimary?: boolean;
    createParentLogin?: { email?: string; password: string } };
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "students:write");
    const student = await tx.student.create({ data: {
      schoolId: input.schoolId, admissionNo: input.admissionNo.trim(),
      name: input.name.trim(), dob: input.dob, classId: input.classId, photoUrl: input.photoUrl
    }});

    if (input.guardian) {
      let userId: string | undefined;
      if (input.guardian.createParentLogin) {
        if (input.guardian.createParentLogin.password.length < 12) {
          throw new AppError("Parent password must contain at least 12 characters.", 400, "WEAK_PASSWORD");
        }
        const parentRole = await tx.role.findUniqueOrThrow({
          where: { schoolId_name: { schoolId: input.schoolId, name: "Parent" } }
        });
        const parent = await tx.user.create({ data: {
          schoolId: input.schoolId, name: input.guardian.name.trim(),
          email: input.guardian.createParentLogin.email?.trim().toLowerCase(),
          phone: input.guardian.phone.trim(),
          passwordHash: await hash(input.guardian.createParentLogin.password, 12)
        }});
        await tx.userRole.create({ data: {
          schoolId: input.schoolId, userId: parent.id, roleId: parentRole.id
        }});
        userId = parent.id;
      }

      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId: input.schoolId, phone: input.guardian.phone.trim() } },
        update: { name: input.guardian.name.trim(), userId: userId ?? undefined },
        create: { schoolId: input.schoolId, name: input.guardian.name.trim(),
          phone: input.guardian.phone.trim(), userId }
      });
      await tx.studentGuardian.create({ data: {
        schoolId: input.schoolId, studentId: student.id, guardianId: guardian.id,
        relationship: input.guardian.relationship.trim(), isPrimary: input.guardian.isPrimary ?? true
      }});
    }

    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "student.registered", entityType: "Student", entityId: student.id, after: student });
    return student;
  });
}

export async function visibleStudents(tx: TenantDb, userId: string) {
  if (await hasPermission(tx, userId, "students:write") || await hasPermission(tx, userId, "scores:write:all")) {
    return tx.student.findMany({ include: { class: true, guardians: { include: { guardian: true } } } });
  }
  if (await hasPermission(tx, userId, "scores:write:assigned")) {
    return tx.student.findMany({ where: {
      OR: [
        { class: { classTeacherId: userId } },
        { class: { subjectAssignments: { some: { teacherId: userId } } } }
      ]
    }, include: { class: true } });
  }
  if (await hasPermission(tx, userId, "parents:read_linked")) {
    return tx.student.findMany({ where: {
      guardians: { some: { guardian: { userId } } }
    }, include: { class: true } });
  }
  throw new ForbiddenError("No student records are visible to this account.");
}

export async function visibleStudentById(tx: TenantDb, userId: string, studentId: string) {
  const students = await visibleStudents(tx, userId);
  const student = students.find((row) => row.id === studentId);
  if (!student) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");
  return student;
}
