import { appendSchoolAudit } from "./audit";
import { withTenant } from "./db";
import { requirePermission } from "./rbac";

export async function createClass(input: {
  schoolId: string; actorId: string; name: string; level?: string; classTeacherId?: string;
}) {
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "classes:manage");
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
