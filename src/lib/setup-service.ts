import { appendSchoolAudit } from "./audit";
import { withTenant } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";
import { getSchoolAuthorization } from "./authorization";

const teachingRoleKeys = new Set(["class_teacher", "subject_teacher", "academic_coordinator", "department_head", "principal", "vice_principal", "owner"]);

async function requireActiveTeachingUser(tx: Parameters<typeof requirePermission>[0], schoolId: string, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, status: "active" },
    select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } }
  });
  if (!user) throw new AppError("The selected teacher account is not active.", 400, "INVALID_TEACHER");
  const isTeaching = user.userRoles.some(({ role }) => teachingRoleKeys.has(role.key?.trim() || role.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")));
  if (!isTeaching) throw new ForbiddenError("Only active teaching or academic leadership accounts can be assigned to classes and subjects.");
  return user;
}

export async function createClass(input: {
  schoolId: string; actorId: string; name: string; level?: string; classTeacherId?: string;
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "classes:manage");
    if (input.classTeacherId) await requireActiveTeachingUser(tx, input.schoolId, input.classTeacherId);
    const row = await tx.class.create({ data: {
      schoolId: input.schoolId, name: input.name.trim(),
      level: input.level?.trim(), classTeacherId: input.classTeacherId
    }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "class.created", entityType: "Class", entityId: row.id, after: row });
    return row;
  });
}

export async function createSubject(input: {
  schoolId: string; actorId: string; name: string;
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "classes:manage");
    const row = await tx.subject.create({ data: { schoolId: input.schoolId, name: input.name.trim() }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "subject.created", entityType: "Subject", entityId: row.id, after: row });
    return row;
  });
}

export async function assignSubjectTeacher(input: {
  schoolId: string; actorId: string; classId: string; subjectId: string; teacherId: string;
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "classes:manage");
    await requireActiveTeachingUser(tx, input.schoolId, input.teacherId);
    const [schoolClass, subject] = await Promise.all([
      tx.class.findUnique({ where: { id: input.classId }, select: { id: true, name: true } }),
      tx.subject.findUnique({ where: { id: input.subjectId }, select: { id: true, name: true } })
    ]);
    if (!schoolClass || !subject) throw new AppError("The selected class or subject does not belong to this school.", 400, "INVALID_CONTEXT");
    const existing = await tx.classSubjectTeacher.findUnique({ where: { classId_subjectId_teacherId: { classId: input.classId, subjectId: input.subjectId, teacherId: input.teacherId } } });
    if (existing) throw new AppError("This teacher is already assigned to the selected class and subject.", 409, "DUPLICATE_ASSIGNMENT");
    const row = await tx.classSubjectTeacher.create({ data: {
      schoolId: input.schoolId, classId: input.classId,
      subjectId: input.subjectId, teacherId: input.teacherId
    }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "teacher.assignment_created", entityType: "ClassSubjectTeacher",
      entityId: input.classId + ":" + input.subjectId + ":" + input.teacherId, after: row });
    return row;
  });
}
