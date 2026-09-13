import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import {
  getAcademicStructureTemplate,
  type AcademicLevelKind,
  type AcademicStructureTemplateKey,
} from "@/lib/academic-structure-templates";
import {
  planAcademicYearRollover,
  type AcademicRolloverPlan,
  type RolloverDecision,
  type RolloverGrade,
  type RolloverLearner,
  type RolloverRule,
  type RolloverSection,
} from "@/lib/academic-rollover-planner";

type FrameworkRow = { id: string; schoolId: string; name: string; templateKey: string | null; status: string; isDefault: boolean };
type GradeRow = { id: string; frameworkId: string; key: string; name: string; shortName: string | null; phase: string; sequence: number; kind: string; isTerminal: boolean; pathwayRequired: boolean; isActive: boolean };
type PathwayRow = { id: string; frameworkId: string; code: string; name: string; category: string | null; isActive: boolean };
type ProgressionRow = { id: string; frameworkId: string; fromGradeLevelId: string; toGradeLevelId: string | null; targetPathwayId: string | null; outcome: "advance" | "complete" | "exit"; priority: number; isDefault: boolean; isActive: boolean };
type SectionRow = { id: string; academicYearId: string; gradeLevelId: string; classId: string; pathwayId: string | null; sectionCode: string; displayName: string; capacity: number | null; isActive: boolean };
type YearEnrollmentRow = { id: string; studentId: string; academicYearId: string; frameworkId: string; gradeLevelId: string; pathwayId: string | null; status: string };
type DecisionRow = { id: string; studentId: string; sourceAcademicYearId: string; targetAcademicYearId: string | null; sourceGradeLevelId: string; targetGradeLevelId: string | null; targetPathwayId: string | null; outcome: RolloverDecision["outcome"]; status: string };
type RolloverRow = { id: string; sourceAcademicYearId: string; targetAcademicYearId: string; frameworkId: string; status: string; version: number };
type RolloverItemRow = { id: string; studentId: string; sourceYearEnrollmentId: string; decisionId: string | null; sourceGradeLevelId: string; targetGradeLevelId: string | null; targetPathwayId: string | null; targetClassSectionId: string | null; outcome: string; status: string; blockers: unknown };

const LEVEL_KINDS = new Set<AcademicLevelKind>(["early_years", "grade", "year", "stage", "level"]);
const DECISION_OUTCOMES = new Set(["promoted", "retained", "graduated", "transferred", "withdrawn", "deferred"]);

function clean(value: string, label: string, max = 120) {
  const next = value.trim();
  if (!next) throw new AppError(`${label} is required.`, 400, "ACADEMIC_STRUCTURE_INVALID");
  if (next.length > max) throw new AppError(`${label} is too long.`, 400, "ACADEMIC_STRUCTURE_INVALID");
  return next;
}

function key(value: string) {
  return clean(value, "Key", 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function code(value: string) {
  return clean(value, "Code", 40).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function advisoryLock(tx: TenantDb, value: string) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, value);
}

async function framework(tx: TenantDb, schoolId: string, frameworkId: string) {
  const rows = await tx.$queryRawUnsafe<FrameworkRow[]>(
    `SELECT "id","schoolId","name","templateKey","status","isDefault" FROM "AcademicFramework" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    frameworkId,
  );
  if (!rows[0]) throw new AppError("Academic framework not found.", 404, "ACADEMIC_FRAMEWORK_NOT_FOUND");
  if (rows[0].status !== "active") throw new AppError("This academic framework is archived.", 409, "ACADEMIC_FRAMEWORK_ARCHIVED");
  return rows[0];
}

async function grade(tx: TenantDb, schoolId: string, gradeLevelId: string) {
  const rows = await tx.$queryRawUnsafe<GradeRow[]>(
    `SELECT "id","frameworkId","key","name","shortName","phase","sequence","kind","isTerminal","pathwayRequired","isActive" FROM "GradeLevel" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    gradeLevelId,
  );
  if (!rows[0] || !rows[0].isActive) throw new AppError("Academic grade/level not found or inactive.", 404, "GRADE_LEVEL_NOT_FOUND");
  return rows[0];
}

async function pathway(tx: TenantDb, schoolId: string, pathwayId: string) {
  const rows = await tx.$queryRawUnsafe<PathwayRow[]>(
    `SELECT "id","frameworkId","code","name","category","isActive" FROM "AcademicPathway" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    pathwayId,
  );
  if (!rows[0] || !rows[0].isActive) throw new AppError("Academic pathway not found or inactive.", 404, "ACADEMIC_PATHWAY_NOT_FOUND");
  return rows[0];
}

export async function getAcademicStructureState(tx: TenantDb, schoolId: string) {
  const [frameworks, grades, pathways, progression, sections] = await Promise.all([
    tx.$queryRawUnsafe<FrameworkRow[]>(`SELECT "id","schoolId","name","templateKey","status","isDefault" FROM "AcademicFramework" WHERE "schoolId"=$1 ORDER BY "isDefault" DESC,"name" ASC`, schoolId),
    tx.$queryRawUnsafe<GradeRow[]>(`SELECT "id","frameworkId","key","name","shortName","phase","sequence","kind","isTerminal","pathwayRequired","isActive" FROM "GradeLevel" WHERE "schoolId"=$1 ORDER BY "frameworkId","sequence","name"`, schoolId),
    tx.$queryRawUnsafe<PathwayRow[]>(`SELECT "id","frameworkId","code","name","category","isActive" FROM "AcademicPathway" WHERE "schoolId"=$1 ORDER BY "frameworkId","name"`, schoolId),
    tx.$queryRawUnsafe<ProgressionRow[]>(`SELECT "id","frameworkId","fromGradeLevelId","toGradeLevelId","targetPathwayId","outcome","priority","isDefault","isActive" FROM "GradeProgressionRule" WHERE "schoolId"=$1 ORDER BY "frameworkId","priority","id"`, schoolId),
    tx.$queryRawUnsafe<SectionRow[]>(`SELECT "id","academicYearId","gradeLevelId","classId","pathwayId","sectionCode","displayName","capacity","isActive" FROM "ClassSection" WHERE "schoolId"=$1 ORDER BY "academicYearId","displayName"`, schoolId),
  ]);
  return { frameworks, grades, pathways, progression, sections };
}

export async function createCustomAcademicFramework(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  name: string;
  makeDefault?: boolean;
}) {
  const name = clean(input.name, "Framework name", 120);
  await advisoryLock(tx, `academic-framework:${input.schoolId}`);
  if (input.makeDefault) await tx.$executeRawUnsafe(`UPDATE "AcademicFramework" SET "isDefault"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "isDefault"=true`, input.schoolId);
  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicFramework" ("id","schoolId","name","templateKey","status","isDefault","createdBy") VALUES ($1,$2,$3,NULL,'active',$4,$5)`,
    id, input.schoolId, name, Boolean(input.makeDefault), input.actorId,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_framework.created", entityType: "AcademicFramework", entityId: id, after: { name, templateKey: null, isDefault: Boolean(input.makeDefault) } });
  return { id, name, templateKey: null, isDefault: Boolean(input.makeDefault) };
}

export async function installAcademicStructureTemplate(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  templateKey: AcademicStructureTemplateKey;
  name?: string;
  makeDefault?: boolean;
}) {
  const template = getAcademicStructureTemplate(input.templateKey);
  const name = clean(input.name || template.name, "Framework name", 120);
  await advisoryLock(tx, `academic-framework:${input.schoolId}`);
  const duplicate = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "AcademicFramework" WHERE "schoolId"=$1 AND lower("name")=lower($2) LIMIT 1`, input.schoolId, name);
  if (duplicate[0]) throw new AppError("An academic framework with this name already exists.", 409, "ACADEMIC_FRAMEWORK_DUPLICATE");
  if (input.makeDefault !== false) await tx.$executeRawUnsafe(`UPDATE "AcademicFramework" SET "isDefault"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "isDefault"=true`, input.schoolId);

  const frameworkId = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicFramework" ("id","schoolId","name","templateKey","status","isDefault","createdBy") VALUES ($1,$2,$3,$4,'active',$5,$6)`,
    frameworkId, input.schoolId, name, template.key, input.makeDefault !== false, input.actorId,
  );

  const levelIds = new Map<string, string>();
  for (const item of template.levels) {
    const id = createId();
    levelIds.set(item.key, id);
    await tx.$executeRawUnsafe(
      `INSERT INTO "GradeLevel" ("id","schoolId","frameworkId","key","name","shortName","phase","sequence","kind","isTerminal","pathwayRequired") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      id, input.schoolId, frameworkId, item.key, item.name, item.shortName ?? null, item.phase, item.sequence, item.kind, Boolean(item.isTerminal), Boolean(item.pathwayRequired),
    );
  }

  const pathwayIds = new Map<string, string>();
  for (const item of template.pathways) {
    const id = createId();
    pathwayIds.set(item.code, id);
    await tx.$executeRawUnsafe(
      `INSERT INTO "AcademicPathway" ("id","schoolId","frameworkId","code","name","category") VALUES ($1,$2,$3,$4,$5,$6)`,
      id, input.schoolId, frameworkId, item.code, item.name, item.category ?? null,
    );
  }

  for (const item of template.progression) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "GradeProgressionRule" ("id","schoolId","frameworkId","fromGradeLevelId","toGradeLevelId","targetPathwayId","outcome","priority","isDefault") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      createId(), input.schoolId, frameworkId, levelIds.get(item.from)!, item.to ? levelIds.get(item.to)! : null, item.targetPathwayCode ? pathwayIds.get(item.targetPathwayCode)! : null, item.outcome, item.priority ?? 100, item.isDefault !== false,
    );
  }

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "academic_framework.template_installed",
    entityType: "AcademicFramework",
    entityId: frameworkId,
    after: { templateKey: template.key, name, levels: template.levels.length, pathways: template.pathways.length, isDefault: input.makeDefault !== false },
  });
  return { id: frameworkId, name, templateKey: template.key, levelCount: template.levels.length, pathwayCount: template.pathways.length };
}

export async function addGradeLevel(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  frameworkId: string;
  key: string;
  name: string;
  shortName?: string | null;
  phase: string;
  sequence: number;
  kind?: AcademicLevelKind;
  isTerminal?: boolean;
  pathwayRequired?: boolean;
}) {
  await framework(tx, input.schoolId, input.frameworkId);
  const kind = input.kind ?? "grade";
  if (!LEVEL_KINDS.has(kind)) throw new AppError("Unsupported academic level kind.", 400, "ACADEMIC_STRUCTURE_INVALID");
  if (!Number.isInteger(input.sequence) || input.sequence < 0) throw new AppError("Level sequence must be a non-negative whole number.", 400, "ACADEMIC_STRUCTURE_INVALID");
  const id = createId();
  const levelKey = key(input.key);
  const name = clean(input.name, "Level name");
  const phase = clean(input.phase, "Phase");
  await tx.$executeRawUnsafe(
    `INSERT INTO "GradeLevel" ("id","schoolId","frameworkId","key","name","shortName","phase","sequence","kind","isTerminal","pathwayRequired") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    id, input.schoolId, input.frameworkId, levelKey, name, input.shortName?.trim() || null, phase, input.sequence, kind, Boolean(input.isTerminal), Boolean(input.pathwayRequired),
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_level.created", entityType: "GradeLevel", entityId: id, after: { frameworkId: input.frameworkId, key: levelKey, name, phase, sequence: input.sequence, kind } });
  return { id, frameworkId: input.frameworkId, key: levelKey, name, phase, sequence: input.sequence, kind };
}

export async function createAcademicPathway(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  frameworkId: string;
  code: string;
  name: string;
  category?: string | null;
}) {
  await framework(tx, input.schoolId, input.frameworkId);
  const id = createId();
  const pathwayCode = code(input.code);
  const name = clean(input.name, "Pathway name");
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicPathway" ("id","schoolId","frameworkId","code","name","category") VALUES ($1,$2,$3,$4,$5,$6)`,
    id, input.schoolId, input.frameworkId, pathwayCode, name, input.category?.trim() || null,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_pathway.created", entityType: "AcademicPathway", entityId: id, after: { frameworkId: input.frameworkId, code: pathwayCode, name } });
  return { id, frameworkId: input.frameworkId, code: pathwayCode, name };
}

export async function setGradeProgressionRule(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  frameworkId: string;
  fromGradeLevelId: string;
  toGradeLevelId?: string | null;
  targetPathwayId?: string | null;
  outcome: "advance" | "complete" | "exit";
  priority?: number;
  isDefault?: boolean;
}) {
  const [from, target, targetPathway] = await Promise.all([
    grade(tx, input.schoolId, input.fromGradeLevelId),
    input.toGradeLevelId ? grade(tx, input.schoolId, input.toGradeLevelId) : Promise.resolve(null),
    input.targetPathwayId ? pathway(tx, input.schoolId, input.targetPathwayId) : Promise.resolve(null),
  ]);
  if (from.frameworkId !== input.frameworkId || target && target.frameworkId !== input.frameworkId || targetPathway && targetPathway.frameworkId !== input.frameworkId) throw new AppError("Progression levels/pathway must belong to the same academic framework.", 409, "ACADEMIC_FRAMEWORK_MISMATCH");
  if (input.outcome === "advance" && !target) throw new AppError("An advance rule needs a target level.", 400, "ACADEMIC_PROGRESSION_INVALID");
  if (input.outcome !== "advance" && target) throw new AppError("Completion/exit rules cannot have a target level.", 400, "ACADEMIC_PROGRESSION_INVALID");
  if (target?.id === from.id) throw new AppError("A level cannot progress to itself.", 400, "ACADEMIC_PROGRESSION_INVALID");
  if (input.isDefault !== false) await tx.$executeRawUnsafe(`UPDATE "GradeProgressionRule" SET "isDefault"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "fromGradeLevelId"=$2 AND "isDefault"=true`, input.schoolId, from.id);
  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "GradeProgressionRule" ("id","schoolId","frameworkId","fromGradeLevelId","toGradeLevelId","targetPathwayId","outcome","priority","isDefault") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id, input.schoolId, input.frameworkId, from.id, target?.id ?? null, targetPathway?.id ?? null, input.outcome, input.priority ?? 100, input.isDefault !== false,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_progression.created", entityType: "GradeProgressionRule", entityId: id, after: { frameworkId: input.frameworkId, fromGradeLevelId: from.id, toGradeLevelId: target?.id ?? null, targetPathwayId: targetPathway?.id ?? null, outcome: input.outcome } });
  return { id };
}

export async function mapClassSection(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  academicYearId: string;
  gradeLevelId: string;
  classId: string;
  pathwayId?: string | null;
  sectionCode: string;
  displayName?: string;
  capacity?: number | null;
}) {
  await advisoryLock(tx, `class-section:${input.schoolId}:${input.academicYearId}:${input.classId}`);
  const [year, schoolClass, gradeLevel, selectedPathway] = await Promise.all([
    tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, select: { id: true, name: true, isLocked: true } }),
    tx.class.findFirst({ where: { id: input.classId, schoolId: input.schoolId }, select: { id: true, name: true } }),
    grade(tx, input.schoolId, input.gradeLevelId),
    input.pathwayId ? pathway(tx, input.schoolId, input.pathwayId) : Promise.resolve(null),
  ]);
  if (!year) throw new AppError("Academic year not found.", 404, "ACADEMIC_YEAR_NOT_FOUND");
  if (!schoolClass) throw new AppError("Class not found.", 404, "CLASS_NOT_FOUND");
  if (year.isLocked) throw new AppError("Class structure cannot be changed inside a locked academic year.", 409, "ACADEMIC_YEAR_LOCKED");
  if (selectedPathway && selectedPathway.frameworkId !== gradeLevel.frameworkId) throw new AppError("Class pathway and grade must belong to the same academic framework.", 409, "ACADEMIC_FRAMEWORK_MISMATCH");
  if (input.capacity !== null && input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity <= 0)) throw new AppError("Section capacity must be a positive whole number.", 400, "ACADEMIC_STRUCTURE_INVALID");

  const existing = await tx.$queryRawUnsafe<SectionRow[]>(
    `SELECT "id","academicYearId","gradeLevelId","classId","pathwayId","sectionCode","displayName","capacity","isActive" FROM "ClassSection" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "classId"=$3 LIMIT 1`,
    input.schoolId, input.academicYearId, input.classId,
  );
  const sectionCode = clean(input.sectionCode, "Section code", 40);
  const displayName = clean(input.displayName || schoolClass.name, "Section display name", 120);
  if (existing[0]) {
    const changingAcademicMeaning = existing[0].gradeLevelId !== gradeLevel.id || existing[0].pathwayId !== (selectedPathway?.id ?? null);
    if (changingAcademicMeaning) {
      const history = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS "count" FROM "Enrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "classId"=$3 AND "status" IN ('ready','confirmed')`,
        input.schoolId, input.academicYearId, input.classId,
      );
      if (Number(history[0]?.count ?? 0) > 0) throw new AppError("This class already has official term enrolment history. Its grade/pathway mapping is locked.", 409, "SECTION_MAPPING_LOCKED");
    }
    await tx.$executeRawUnsafe(
      `UPDATE "ClassSection" SET "gradeLevelId"=$4,"pathwayId"=$5,"sectionCode"=$6,"displayName"=$7,"capacity"=$8,"isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "classId"=$3`,
      input.schoolId, input.academicYearId, input.classId, gradeLevel.id, selectedPathway?.id ?? null, sectionCode, displayName, input.capacity ?? null,
    );
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "class_section.updated", entityType: "ClassSection", entityId: existing[0].id, before: existing[0], after: { academicYearId: input.academicYearId, classId: input.classId, gradeLevelId: gradeLevel.id, pathwayId: selectedPathway?.id ?? null, sectionCode, displayName, capacity: input.capacity ?? null } });
    return { id: existing[0].id, updated: true };
  }

  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "ClassSection" ("id","schoolId","academicYearId","gradeLevelId","classId","pathwayId","sectionCode","displayName","capacity") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id, input.schoolId, input.academicYearId, gradeLevel.id, input.classId, selectedPathway?.id ?? null, sectionCode, displayName, input.capacity ?? null,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "class_section.created", entityType: "ClassSection", entityId: id, after: { academicYearId: input.academicYearId, classId: input.classId, gradeLevelId: gradeLevel.id, pathwayId: selectedPathway?.id ?? null, sectionCode, displayName, capacity: input.capacity ?? null } });
  return { id, updated: false };
}

export async function recordPromotionDecision(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  studentId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId?: string | null;
  outcome: RolloverDecision["outcome"];
  targetGradeLevelId?: string | null;
  targetPathwayId?: string | null;
  reason?: string | null;
}) {
  if (!DECISION_OUTCOMES.has(input.outcome)) throw new AppError("Unsupported promotion outcome.", 400, "PROMOTION_DECISION_INVALID");
  await advisoryLock(tx, `promotion-decision:${input.schoolId}:${input.studentId}:${input.sourceAcademicYearId}`);
  const sourceRows = await tx.$queryRawUnsafe<YearEnrollmentRow[]>(
    `SELECT "id","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId","status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3 LIMIT 1`,
    input.schoolId, input.studentId, input.sourceAcademicYearId,
  );
  const source = sourceRows[0];
  if (!source) throw new AppError("The learner has no year-grade enrollment for this academic year.", 409, "YEAR_ENROLLMENT_REQUIRED");
  if (input.targetAcademicYearId) {
    const targetYear = await tx.academicYear.findFirst({ where: { id: input.targetAcademicYearId, schoolId: input.schoolId }, select: { id: true } });
    if (!targetYear) throw new AppError("Target academic year not found.", 404, "ACADEMIC_YEAR_NOT_FOUND");
  }
  let targetGradeLevelId = input.targetGradeLevelId ?? null;
  if (input.outcome === "retained" && !targetGradeLevelId) targetGradeLevelId = source.gradeLevelId;
  if (["graduated", "transferred", "withdrawn"].includes(input.outcome)) targetGradeLevelId = null;
  if (targetGradeLevelId) {
    const targetGrade = await grade(tx, input.schoolId, targetGradeLevelId);
    if (targetGrade.frameworkId !== source.frameworkId) throw new AppError("Promotion target must belong to the learner's academic framework.", 409, "ACADEMIC_FRAMEWORK_MISMATCH");
  }
  if (input.targetPathwayId) {
    const targetPathway = await pathway(tx, input.schoolId, input.targetPathwayId);
    if (targetPathway.frameworkId !== source.frameworkId) throw new AppError("Promotion pathway must belong to the learner's academic framework.", 409, "ACADEMIC_FRAMEWORK_MISMATCH");
  }

  const existing = await tx.$queryRawUnsafe<Array<{ id: string; outcome: string; targetGradeLevelId: string | null; targetPathwayId: string | null }>>(
    `SELECT "id","outcome","targetGradeLevelId","targetPathwayId" FROM "PromotionDecision" WHERE "schoolId"=$1 AND "studentId"=$2 AND "sourceAcademicYearId"=$3 LIMIT 1`,
    input.schoolId, input.studentId, input.sourceAcademicYearId,
  );
  const id = existing[0]?.id ?? createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "PromotionDecision" ("id","schoolId","studentId","frameworkId","sourceAcademicYearId","targetAcademicYearId","sourceGradeLevelId","targetGradeLevelId","targetPathwayId","outcome","status","reason","decidedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11,$12)
     ON CONFLICT ("schoolId","studentId","sourceAcademicYearId") DO UPDATE SET "targetAcademicYearId"=EXCLUDED."targetAcademicYearId","targetGradeLevelId"=EXCLUDED."targetGradeLevelId","targetPathwayId"=EXCLUDED."targetPathwayId","outcome"=EXCLUDED."outcome","status"='confirmed',"reason"=EXCLUDED."reason","decidedBy"=EXCLUDED."decidedBy","decidedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
    id, input.schoolId, input.studentId, source.frameworkId, input.sourceAcademicYearId, input.targetAcademicYearId ?? null, source.gradeLevelId, targetGradeLevelId, input.targetPathwayId ?? null, input.outcome, input.reason?.trim() || null, input.actorId,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "student.promotion_decision_recorded", entityType: "PromotionDecision", entityId: id, before: existing[0] ?? null, after: { studentId: input.studentId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId ?? null, outcome: input.outcome, targetGradeLevelId, targetPathwayId: input.targetPathwayId ?? null } });
  return { id, outcome: input.outcome, targetGradeLevelId, targetPathwayId: input.targetPathwayId ?? null };
}

export async function previewAcademicYearRollover(tx: TenantDb, input: {
  schoolId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  frameworkId: string;
}): Promise<AcademicRolloverPlan> {
  if (input.sourceAcademicYearId === input.targetAcademicYearId) throw new AppError("Source and target academic years must be different.", 400, "ROLLOVER_YEAR_INVALID");
  const [sourceYear, targetYear, selectedFramework] = await Promise.all([
    tx.academicYear.findFirst({ where: { id: input.sourceAcademicYearId, schoolId: input.schoolId }, select: { id: true, name: true } }),
    tx.academicYear.findFirst({ where: { id: input.targetAcademicYearId, schoolId: input.schoolId }, select: { id: true, name: true } }),
    framework(tx, input.schoolId, input.frameworkId),
  ]);
  if (!sourceYear || !targetYear) throw new AppError("Source or target academic year not found.", 404, "ACADEMIC_YEAR_NOT_FOUND");

  const [sourceEnrollments, decisions, grades, rules, sections, targetEnrollments, loadRows] = await Promise.all([
    tx.$queryRawUnsafe<YearEnrollmentRow[]>(`SELECT "id","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId","status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "frameworkId"=$3 AND "status" IN ('active','retained') ORDER BY "studentId"`, input.schoolId, input.sourceAcademicYearId, selectedFramework.id),
    tx.$queryRawUnsafe<DecisionRow[]>(`SELECT "id","studentId","sourceAcademicYearId","targetAcademicYearId","sourceGradeLevelId","targetGradeLevelId","targetPathwayId","outcome","status" FROM "PromotionDecision" WHERE "schoolId"=$1 AND "sourceAcademicYearId"=$2 AND "frameworkId"=$3 AND "status" IN ('confirmed','applied')`, input.schoolId, input.sourceAcademicYearId, selectedFramework.id),
    tx.$queryRawUnsafe<GradeRow[]>(`SELECT "id","frameworkId","key","name","shortName","phase","sequence","kind","isTerminal","pathwayRequired","isActive" FROM "GradeLevel" WHERE "schoolId"=$1 AND "frameworkId"=$2 AND "isActive"=true`, input.schoolId, selectedFramework.id),
    tx.$queryRawUnsafe<ProgressionRow[]>(`SELECT "id","frameworkId","fromGradeLevelId","toGradeLevelId","targetPathwayId","outcome","priority","isDefault","isActive" FROM "GradeProgressionRule" WHERE "schoolId"=$1 AND "frameworkId"=$2 AND "isActive"=true`, input.schoolId, selectedFramework.id),
    tx.$queryRawUnsafe<SectionRow[]>(`SELECT "id","academicYearId","gradeLevelId","classId","pathwayId","sectionCode","displayName","capacity","isActive" FROM "ClassSection" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "isActive"=true`, input.schoolId, input.targetAcademicYearId),
    tx.$queryRawUnsafe<Array<{ studentId: string }>>(`SELECT "studentId" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "status" NOT IN ('withdrawn','transferred')`, input.schoolId, input.targetAcademicYearId),
    tx.$queryRawUnsafe<Array<{ sectionId: string; count: bigint }>>(
      `SELECT cs."id" AS "sectionId", COUNT(DISTINCT e."studentId")::bigint AS "count"
         FROM "ClassSection" cs
         LEFT JOIN "Enrollment" e ON e."schoolId"=cs."schoolId" AND e."academicYearId"=cs."academicYearId" AND e."classId"=cs."classId" AND e."status" IN ('draft','ready','confirmed')
        WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."isActive"=true
        GROUP BY cs."id"`,
      input.schoolId, input.targetAcademicYearId,
    ),
  ]);

  const decisionByStudent = new Map(decisions.map((item) => [item.studentId, item]));
  const alreadyEnrolled = new Set(targetEnrollments.map((item) => item.studentId));
  const learners: RolloverLearner[] = sourceEnrollments.map((item) => {
    const decision = decisionByStudent.get(item.studentId);
    return {
      studentId: item.studentId,
      sourceYearEnrollmentId: item.id,
      sourceGradeLevelId: item.gradeLevelId,
      sourcePathwayId: item.pathwayId,
      targetYearAlreadyEnrolled: alreadyEnrolled.has(item.studentId),
      decision: decision ? { id: decision.id, outcome: decision.outcome, targetGradeLevelId: decision.targetGradeLevelId, targetPathwayId: decision.targetPathwayId } : null,
    };
  });
  const plannerGrades: RolloverGrade[] = grades.map((item) => ({ id: item.id, pathwayRequired: item.pathwayRequired }));
  const plannerRules: RolloverRule[] = rules.map((item) => ({ fromGradeLevelId: item.fromGradeLevelId, toGradeLevelId: item.toGradeLevelId, targetPathwayId: item.targetPathwayId, outcome: item.outcome, priority: item.priority, isDefault: item.isDefault }));
  const plannerSections: RolloverSection[] = sections.map((item) => ({ id: item.id, gradeLevelId: item.gradeLevelId, pathwayId: item.pathwayId, displayName: item.displayName, capacity: item.capacity, classId: item.classId }));
  const existingLoads = Object.fromEntries(loadRows.map((item) => [item.sectionId, Number(item.count)]));
  return planAcademicYearRollover({ learners, grades: plannerGrades, rules: plannerRules, sections: plannerSections, existingLoads });
}

export async function prepareAcademicYearRollover(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  frameworkId: string;
}) {
  await advisoryLock(tx, `academic-rollover:${input.schoolId}:${input.sourceAcademicYearId}:${input.targetAcademicYearId}:${input.frameworkId}`);
  const open = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    `SELECT "id","status" FROM "AcademicYearRollover" WHERE "schoolId"=$1 AND "sourceAcademicYearId"=$2 AND "targetAcademicYearId"=$3 AND "frameworkId"=$4 AND "status" IN ('draft','validated') LIMIT 1`,
    input.schoolId, input.sourceAcademicYearId, input.targetAcademicYearId, input.frameworkId,
  );
  if (open[0]) throw new AppError("An open rollover plan already exists for these academic years. Commit or cancel it before preparing another.", 409, "ROLLOVER_ALREADY_OPEN");
  const plan = await previewAcademicYearRollover(tx, input);
  const id = createId();
  const status = plan.summary.blocked === 0 ? "validated" : "draft";
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicYearRollover" ("id","schoolId","sourceAcademicYearId","targetAcademicYearId","frameworkId","status","createdBy","validatedBy","validatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id, input.schoolId, input.sourceAcademicYearId, input.targetAcademicYearId, input.frameworkId, status, input.actorId, status === "validated" ? input.actorId : null, status === "validated" ? new Date() : null,
  );
  for (const item of plan.items) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "AcademicYearRolloverItem" ("id","schoolId","rolloverId","studentId","sourceYearEnrollmentId","decisionId","sourceGradeLevelId","targetGradeLevelId","targetPathwayId","targetClassSectionId","outcome","status","blockers") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      createId(), input.schoolId, id, item.studentId, item.sourceYearEnrollmentId, item.decisionId, item.sourceGradeLevelId, item.targetGradeLevelId, item.targetPathwayId, item.targetClassSectionId, item.outcome, item.status, JSON.stringify(item.blockers),
    );
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_year_rollover.prepared", entityType: "AcademicYearRollover", entityId: id, after: { sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, frameworkId: input.frameworkId, status, summary: plan.summary } });
  return { id, status, plan };
}

export async function commitAcademicYearRollover(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  rolloverId: string;
}) {
  await advisoryLock(tx, `academic-rollover-commit:${input.schoolId}:${input.rolloverId}`);
  const runs = await tx.$queryRawUnsafe<RolloverRow[]>(
    `SELECT "id","sourceAcademicYearId","targetAcademicYearId","frameworkId","status","version" FROM "AcademicYearRollover" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1 FOR UPDATE`,
    input.schoolId, input.rolloverId,
  );
  const run = runs[0];
  if (!run) throw new AppError("Rollover plan not found.", 404, "ROLLOVER_NOT_FOUND");
  if (run.status === "committed") return { id: run.id, status: "committed", alreadyCommitted: true };
  if (run.status !== "validated") throw new AppError("Only a validated rollover plan can be committed. Resolve every blocker and prepare a new plan.", 409, "ROLLOVER_NOT_VALIDATED");

  const [items, targetTerms] = await Promise.all([
    tx.$queryRawUnsafe<RolloverItemRow[]>(`SELECT "id","studentId","sourceYearEnrollmentId","decisionId","sourceGradeLevelId","targetGradeLevelId","targetPathwayId","targetClassSectionId","outcome","status","blockers" FROM "AcademicYearRolloverItem" WHERE "schoolId"=$1 AND "rolloverId"=$2 ORDER BY "studentId" FOR UPDATE`, input.schoolId, run.id),
    tx.term.findMany({ where: { schoolId: input.schoolId, academicYearId: run.targetAcademicYearId }, select: { id: true }, orderBy: { startDate: "asc" } }),
  ]);
  if (items.some((item) => item.status === "blocked")) throw new AppError("The rollover contains blocked learners.", 409, "ROLLOVER_NOT_VALIDATED");
  const moving = items.filter((item) => item.outcome === "promoted" || item.outcome === "retained");
  if (moving.length && !targetTerms.length) throw new AppError("Create the target academic year's terms before committing rollover.", 409, "TARGET_TERMS_REQUIRED");

  let promoted = 0, retained = 0, graduated = 0, transferred = 0, withdrawn = 0;
  for (const item of items) {
    if (item.status === "applied") continue;
    if (item.outcome === "deferred") throw new AppError("Deferred promotion decisions must be resolved before rollover.", 409, "ROLLOVER_NOT_VALIDATED");

    if (item.outcome === "graduated" || item.outcome === "transferred" || item.outcome === "withdrawn") {
      const sourceStatus = item.outcome === "graduated" ? "graduated" : item.outcome;
      await tx.$executeRawUnsafe(`UPDATE "StudentYearEnrollment" SET "status"=$4,"endedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "studentId"=$3`, input.schoolId, item.sourceYearEnrollmentId, item.studentId, sourceStatus);
      if (item.outcome === "graduated") graduated += 1;
      if (item.outcome === "transferred") transferred += 1;
      if (item.outcome === "withdrawn") withdrawn += 1;
    } else {
      if (!item.targetGradeLevelId || !item.targetClassSectionId) throw new AppError("A promoted/retained learner has no resolved target level and section.", 409, "ROLLOVER_TARGET_MISSING");
      const sections = await tx.$queryRawUnsafe<SectionRow[]>(`SELECT "id","academicYearId","gradeLevelId","classId","pathwayId","sectionCode","displayName","capacity","isActive" FROM "ClassSection" WHERE "schoolId"=$1 AND "id"=$2 AND "academicYearId"=$3 AND "isActive"=true LIMIT 1`, input.schoolId, item.targetClassSectionId, run.targetAcademicYearId);
      const section = sections[0];
      if (!section || section.gradeLevelId !== item.targetGradeLevelId || section.pathwayId !== item.targetPathwayId) throw new AppError("A rollover target section changed after validation. Prepare the rollover again.", 409, "ROLLOVER_TARGET_CHANGED");

      const targetExisting = await tx.$queryRawUnsafe<YearEnrollmentRow[]>(`SELECT "id","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId","status" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3 LIMIT 1`, input.schoolId, item.studentId, run.targetAcademicYearId);
      if (targetExisting[0]) throw new AppError("A learner received a target-year enrollment after rollover validation. Prepare the plan again.", 409, "ROLLOVER_TARGET_CHANGED");

      const targetYearEnrollmentId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "StudentYearEnrollment" ("id","schoolId","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId","status","source","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,'planned','rollover',$8)`,
        targetYearEnrollmentId, input.schoolId, item.studentId, run.targetAcademicYearId, run.frameworkId, item.targetGradeLevelId, item.targetPathwayId, input.actorId,
      );

      for (const term of targetTerms) {
        const existingTerm = await tx.$queryRawUnsafe<Array<{ id: string; classId: string; status: string }>>(`SELECT "id","classId","status" FROM "Enrollment" WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3 AND "termId"=$4 LIMIT 1`, input.schoolId, item.studentId, run.targetAcademicYearId, term.id);
        if (existingTerm[0] && existingTerm[0].classId !== section.classId) throw new AppError("A learner's target-term enrollment conflicts with the rollover section.", 409, "ROLLOVER_TARGET_CHANGED");
        if (!existingTerm[0]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'draft','returning',false,false,false,$7)`,
            createId(), input.schoolId, item.studentId, run.targetAcademicYearId, term.id, section.classId, input.actorId,
          );
        }
      }

      await tx.$executeRawUnsafe(`UPDATE "StudentYearEnrollment" SET "status"=$4,"endedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "studentId"=$3`, input.schoolId, item.sourceYearEnrollmentId, item.studentId, item.outcome === "retained" ? "retained" : "completed");
      if (item.outcome === "retained") retained += 1; else promoted += 1;
    }

    if (item.decisionId) await tx.$executeRawUnsafe(`UPDATE "PromotionDecision" SET "status"='applied',"targetAcademicYearId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, item.decisionId, run.targetAcademicYearId);
    await tx.$executeRawUnsafe(`UPDATE "AcademicYearRolloverItem" SET "status"='applied',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, item.id);
  }

  await tx.$executeRawUnsafe(`UPDATE "AcademicYearRollover" SET "status"='committed',"committedBy"=$3,"committedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "status"='validated'`, input.schoolId, run.id, input.actorId);
  const summary = { total: items.length, promoted, retained, graduated, transferred, withdrawn };
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_year_rollover.committed", entityType: "AcademicYearRollover", entityId: run.id, after: { sourceAcademicYearId: run.sourceAcademicYearId, targetAcademicYearId: run.targetAcademicYearId, frameworkId: run.frameworkId, summary, studentClassProjectionChanged: false } });
  return { id: run.id, status: "committed", alreadyCommitted: false, summary };
}

export async function cancelAcademicYearRollover(tx: TenantDb, input: { schoolId: string; actorId: string; rolloverId: string }) {
  const rows = await tx.$queryRawUnsafe<RolloverRow[]>(`SELECT "id","sourceAcademicYearId","targetAcademicYearId","frameworkId","status","version" FROM "AcademicYearRollover" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1 FOR UPDATE`, input.schoolId, input.rolloverId);
  const run = rows[0];
  if (!run) throw new AppError("Rollover plan not found.", 404, "ROLLOVER_NOT_FOUND");
  if (run.status === "committed") throw new AppError("A committed rollover cannot be cancelled.", 409, "ROLLOVER_ALREADY_COMMITTED");
  await tx.$executeRawUnsafe(`UPDATE "AcademicYearRollover" SET "status"='cancelled',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, run.id);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_year_rollover.cancelled", entityType: "AcademicYearRollover", entityId: run.id, before: { status: run.status }, after: { status: "cancelled" } });
  return { id: run.id, status: "cancelled" };
}

export async function hasActiveAcademicStructure(tx: TenantDb, schoolId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(`SELECT EXISTS(SELECT 1 FROM "AcademicFramework" WHERE "schoolId"=$1 AND "status"='active' AND "isDefault"=true) AS "exists"`, schoolId);
  return Boolean(rows[0]?.exists);
}

export async function resolveTermGradeContext(tx: TenantDb, input: { schoolId: string; studentId: string; termId: string; classId: string }) {
  const term = await tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { academicYearId: true } });
  if (!term) return null;
  const rows = await tx.$queryRawUnsafe<Array<{ frameworkId: string; gradeLevelId: string; pathwayId: string | null; yearEnrollmentId: string }>>(
    `SELECT gl."frameworkId", cs."gradeLevelId", cs."pathwayId", sye."id" AS "yearEnrollmentId"
       FROM "ClassSection" cs
       JOIN "GradeLevel" gl ON gl."id"=cs."gradeLevelId" AND gl."schoolId"=cs."schoolId"
       JOIN "StudentYearEnrollment" sye ON sye."schoolId"=cs."schoolId" AND sye."academicYearId"=cs."academicYearId" AND sye."studentId"=$4 AND sye."gradeLevelId"=cs."gradeLevelId"
      WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."classId"=$3 AND cs."isActive"=true
      LIMIT 1`,
    input.schoolId, term.academicYearId, input.classId, input.studentId,
  );
  return rows[0] ?? null;
}
