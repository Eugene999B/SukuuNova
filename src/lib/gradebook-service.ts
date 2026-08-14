import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { hasPermission, requirePermission } from "./rbac";

export async function createAssessment(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    termId: string;
    classId: string;
    subjectId: string;
    name: string;
    type: "ca" | "exam";
    weight: number;
    maxScore: number;
  }
) {
  await requirePermission(tx, input.actorId, "scores:write:all");
  if (input.weight <= 0 || input.maxScore <= 0) {
    throw new AppError("Assessment weight and maximum score must be positive.", 400, "INVALID_ASSESSMENT");
  }
  const assessment = await tx.assessment.create({
    data: {
      schoolId: input.schoolId,
      termId: input.termId,
      classId: input.classId,
      subjectId: input.subjectId,
      name: input.name.trim(),
      type: input.type,
      weight: new Prisma.Decimal(input.weight),
      maxScore: new Prisma.Decimal(input.maxScore)
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "assessment.created",
    entityType: "Assessment",
    entityId: assessment.id,
    after: assessment
  });
  return assessment;
}

export async function enterScore(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    studentId: string;
    assessmentId: string;
    value: number;
  }
) {
  const assessment = await tx.assessment.findUnique({
    where: { id: input.assessmentId },
    select: {
      id: true,
      classId: true,
      subjectId: true,
      maxScore: true
    }
  });
  if (!assessment) throw new AppError("Assessment not found.", 404, "NOT_FOUND");

  const canWriteAll = await hasPermission(tx, input.actorId, "scores:write:all");
  const canWriteAssigned = await hasPermission(tx, input.actorId, "scores:write:assigned");
  if (!canWriteAll) {
    if (!canWriteAssigned) throw new ForbiddenError("Score entry is not permitted.");
    const assignment = await tx.classSubjectTeacher.findFirst({
      where: {
        classId: assessment.classId,
        subjectId: assessment.subjectId,
        teacherId: input.actorId
      },
      select: { teacherId: true }
    });
    const classTeacher = await tx.class.findFirst({
      where: { id: assessment.classId, classTeacherId: input.actorId },
      select: { id: true }
    });
    if (!assignment && !classTeacher) {
      throw new ForbiddenError("Teachers may enter scores only for assigned classes and subjects.");
    }
  }

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, classId: true }
  });
  if (!student || student.classId !== assessment.classId) {
    throw new AppError("The student is not in the assessment class.", 400, "INVALID_STUDENT_CLASS");
  }
  if (input.value < 0 || new Prisma.Decimal(input.value).greaterThan(assessment.maxScore)) {
    throw new AppError("Score is outside the assessment range.", 400, "INVALID_SCORE");
  }

  const previous = await tx.score.findUnique({
    where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } }
  });
  const score = await tx.score.upsert({
    where: { studentId_assessmentId: { studentId: input.studentId, assessmentId: assessment.id } },
    update: {
      value: new Prisma.Decimal(input.value),
      enteredBy: input.actorId,
      enteredAt: new Date()
    },
    create: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      subjectId: assessment.subjectId,
      assessmentId: assessment.id,
      value: new Prisma.Decimal(input.value),
      enteredBy: input.actorId
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: previous ? "score.updated" : "score.created",
    entityType: "Score",
    entityId: score.id,
    before: previous,
    after: score
  });
  return score;
}
