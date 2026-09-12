"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTeachingTarget } from "@/lib/authorization";
import { appendSchoolAudit } from "@/lib/audit";
import {
  addClassSubjectOffering,
  classSubjectOfferingExists,
  removeClassSubjectOffering,
} from "@/lib/class-subject-offerings";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function returnToClass(classId: string) {
  revalidatePath(`/school/classes/${classId}`);
  redirect(`/school/classes/${classId}#subjects`);
}

export async function addSubjectsToClass(formData: FormData) {
  const session = await requireSchoolSession();
  const classId = required(formData, "classId");
  const subjectIds = [...new Set(formData.getAll("subjectIds").map(String).map((value) => value.trim()).filter(Boolean))];
  if (!subjectIds.length) throw new Error("Choose at least one subject for this class.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [schoolClass, subjects] = await Promise.all([
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, name: true } }),
      tx.subject.findMany({ where: { schoolId: session.schoolId, id: { in: subjectIds } }, select: { id: true, name: true } }),
    ]);
    if (!schoolClass) throw new Error("Class not found.");
    if (subjects.length !== subjectIds.length) throw new Error("One or more selected subjects do not belong to this school.");

    const added: string[] = [];
    for (const subject of subjects) {
      if (await addClassSubjectOffering(tx, { schoolId: session.schoolId, classId, subjectId: subject.id })) added.push(subject.id);
    }
    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "class.subjects_added",
      entityType: "Class",
      entityId: classId,
      after: { subjectIds, addedSubjectIds: added },
    });
  });

  returnToClass(classId);
}

export async function assignTeacherToClassSubject(formData: FormData) {
  const session = await requireSchoolSession();
  const classId = required(formData, "classId");
  const subjectId = required(formData, "subjectId");
  const teacherId = required(formData, "teacherId");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const [schoolClass, subject, offering, teacher] = await Promise.all([
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, name: true } }),
      tx.subject.findFirst({ where: { id: subjectId, schoolId: session.schoolId }, select: { id: true, name: true } }),
      classSubjectOfferingExists(tx, session.schoolId, classId, subjectId),
      requireActiveTeachingTarget(tx, session.schoolId, teacherId),
    ]);
    if (!schoolClass || !subject || !offering) throw new Error("Add the subject to this class before assigning its teacher.");

    await tx.classSubjectTeacher.upsert({
      where: { classId_subjectId_teacherId: { classId, subjectId, teacherId } },
      update: {},
      create: { schoolId: session.schoolId, classId, subjectId, teacherId },
    });
    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "class.subject_teacher_assigned",
      entityType: "ClassSubjectTeacher",
      entityId: `${classId}:${subjectId}:${teacherId}`,
      after: { classId, className: schoolClass.name, subjectId, subjectName: subject.name, teacherId, teacherName: teacher.name },
    });
  });

  returnToClass(classId);
}

export async function removeTeacherFromClassSubject(formData: FormData) {
  const session = await requireSchoolSession();
  const classId = required(formData, "classId");
  const subjectId = required(formData, "subjectId");
  const teacherId = required(formData, "teacherId");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const assignment = await tx.classSubjectTeacher.findFirst({
      where: { schoolId: session.schoolId, classId, subjectId, teacherId },
      select: { classId: true, subjectId: true, teacherId: true },
    });
    if (!assignment) throw new Error("Teacher assignment not found.");

    await tx.classSubjectTeacher.delete({ where: { classId_subjectId_teacherId: { classId, subjectId, teacherId } } });
    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "class.subject_teacher_removed",
      entityType: "ClassSubjectTeacher",
      entityId: `${classId}:${subjectId}:${teacherId}`,
      before: assignment,
    });
  });

  returnToClass(classId);
}

export async function removeSubjectFromClass(formData: FormData) {
  const session = await requireSchoolSession();
  const classId = required(formData, "classId");
  const subjectId = required(formData, "subjectId");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const offering = await classSubjectOfferingExists(tx, session.schoolId, classId, subjectId);
    if (!offering) throw new Error("This subject is not part of the class curriculum.");

    const [teacherLinks, assessments, timetableSlots, academicRows] = await Promise.all([
      tx.classSubjectTeacher.count({ where: { schoolId: session.schoolId, classId, subjectId } }),
      tx.assessment.count({ where: { schoolId: session.schoolId, classId, subjectId } }),
      tx.timetableSlot.count({ where: { schoolId: session.schoolId, classId, subjectId } }),
      tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT (
          (SELECT COUNT(*) FROM "TeacherAcademicWork" WHERE "schoolId" = ${session.schoolId} AND "classId" = ${classId} AND "subjectId" = ${subjectId}) +
          (SELECT COUNT(*) FROM "TeacherAcademicNote" WHERE "schoolId" = ${session.schoolId} AND "classId" = ${classId} AND "subjectId" = ${subjectId})
        )::bigint AS "count"
      `,
    ]);
    const academicCount = Number(academicRows[0]?.count ?? 0n);
    if (teacherLinks || assessments || timetableSlots || academicCount) {
      throw new Error("This subject already has teachers, timetable slots or academic records. Remove active setup first; historical academic data cannot be detached from its class.");
    }

    await removeClassSubjectOffering(tx, { schoolId: session.schoolId, classId, subjectId });
    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "class.subject_removed",
      entityType: "ClassSubjectOffering",
      entityId: `${classId}:${subjectId}`,
      before: { classId, subjectId },
    });
  });

  returnToClass(classId);
}
