import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { getAcademicEngineConfig } from "./academic-engine";
import { categoryWeight, normalizeAssessmentType } from "./assessment-engine";

export async function ensureWorkAssessment(tx: TenantDb, schoolId: string, workId: string, actorId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; termId: string; classId: string; subjectId: string; title: string; kind: string; maxScore: Prisma.Decimal; assessmentId: string | null }>>(
    'SELECT "id","termId","classId","subjectId","title","kind","maxScore","assessmentId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2', schoolId, workId);
  const work = rows[0];
  if (!work) throw new AppError("Work not found.", 404, "NOT_FOUND");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"term-mutation:" + schoolId + ":" + work.termId}))`;
  const term = await tx.term.findFirst({ where: { id: work.termId, schoolId }, select: { isLocked: true } });
  if (!term || term.isLocked) throw new AppError("The academic term is locked or unavailable.", 409, "TERM_LOCKED");

  const academic = await getAcademicEngineConfig(tx, schoolId);
  const assessmentType = normalizeAssessmentType(work.kind);
  const policyWeight = categoryWeight(assessmentType, 0, academic.assessment);

  // Refresh after obtaining the shared term lock: concurrent callers may have linked this work.
  const current = await tx.$queryRawUnsafe<Array<{ assessmentId: string | null }>>('SELECT "assessmentId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2', schoolId, workId);
  const scope = { schoolId, termId: work.termId, classId: work.classId, subjectId: work.subjectId };
  if (current[0]?.assessmentId) {
    const linked = await tx.assessment.findFirst({ where: { ...scope, id: current[0].assessmentId } });
    if (!linked || Number(linked.maxScore) !== Number(work.maxScore)) throw new AppError("The linked assessment context or maximum has changed. Resolve it before recording marks.", 409, "ASSESSMENT_MISMATCH");
    if (normalizeAssessmentType(linked.type) !== assessmentType) {
      throw new AppError("The linked assessment category does not match this academic work. Resolve it before recording marks.", 409, "ASSESSMENT_CATEGORY_MISMATCH");
    }
    return linked;
  }

  // Preserve a legacy title-based assessment only when its ownership and category are unambiguous.
  let assessment = await tx.assessment.findFirst({ where: { ...scope, name: work.title } });
  if (assessment) {
    const matching = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "subjectId"=$4 AND "title"=$5', schoolId, work.termId, work.classId, work.subjectId, work.title);
    const claimed = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "assessmentId"=$2', schoolId, assessment.id);
    if (matching.length !== 1 || claimed.length || Number(assessment.maxScore) !== Number(work.maxScore)) throw new AppError("A legacy assessment with this title is ambiguous. Resolve its ownership before linking marks.", 409, "ASSESSMENT_LINK_CONFLICT");
    if (normalizeAssessmentType(assessment.type) !== assessmentType) {
      throw new AppError("A legacy assessment with this title belongs to a different grading category. Resolve it before linking marks.", 409, "ASSESSMENT_CATEGORY_MISMATCH");
    }
  } else {
    assessment = await tx.assessment.create({
      data: {
        ...scope,
        name: `${work.title} [${work.id}]`,
        type: assessmentType,
        weight: new Prisma.Decimal(policyWeight),
        maxScore: new Prisma.Decimal(work.maxScore),
      },
    });
  }
  await tx.$executeRawUnsafe('UPDATE "TeacherAcademicWork" SET "assessmentId"=$1,"updatedAt"=NOW() WHERE "schoolId"=$2 AND "id"=$3', assessment.id, schoolId, workId);
  await appendSchoolAudit(tx, {
    schoolId,
    actorId,
    action: "academic_work.assessment_linked",
    entityType: "TeacherAcademicWork",
    entityId: workId,
    after: { assessmentId: assessment.id, assessmentType, policyWeight },
  });
  return assessment;
}
