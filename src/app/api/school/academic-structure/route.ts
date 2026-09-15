import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { listAcademicStructureTemplates } from "@/lib/academic-structure-templates";
import {
  addGradeLevel,
  cancelAcademicYearRollover,
  commitAcademicYearRollover,
  createAcademicPathway,
  createCustomAcademicFramework,
  getAcademicStructureState,
  installAcademicStructureTemplate,
  mapClassSection,
  prepareAcademicYearRollover,
  previewAcademicYearRollover,
  recordPromotionDecision,
  setGradeProgressionRule,
} from "@/lib/academic-structure-service";

const templateKey = z.enum(["ghana_standard", "british", "american", "cambridge", "montessori", "tvet", "ib"]);
const levelKind = z.enum(["early_years", "grade", "year", "stage", "level"]);
const decisionOutcome = z.enum(["promoted", "retained", "graduated", "transferred", "withdrawn", "deferred"]);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("installTemplate"), templateKey, name: z.string().trim().min(1).max(120).optional(), makeDefault: z.boolean().optional() }),
  z.object({ action: z.literal("createCustomFramework"), name: z.string().trim().min(1).max(120), makeDefault: z.boolean().optional() }),
  z.object({
    action: z.literal("addGradeLevel"),
    frameworkId: z.string().min(1).max(120),
    key: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    shortName: z.string().trim().max(40).nullable().optional(),
    phase: z.string().trim().min(1).max(120),
    sequence: z.number().int().min(0).max(10000),
    kind: levelKind.optional(),
    isTerminal: z.boolean().optional(),
    pathwayRequired: z.boolean().optional(),
  }),
  z.object({ action: z.literal("createPathway"), frameworkId: z.string().min(1).max(120), code: z.string().min(1).max(40), name: z.string().trim().min(1).max(120), category: z.string().trim().max(120).nullable().optional() }),
  z.object({
    action: z.literal("setProgressionRule"),
    frameworkId: z.string().min(1).max(120),
    fromGradeLevelId: z.string().min(1).max(120),
    toGradeLevelId: z.string().min(1).max(120).nullable().optional(),
    targetPathwayId: z.string().min(1).max(120).nullable().optional(),
    outcome: z.enum(["advance", "complete", "exit"]),
    priority: z.number().int().min(0).max(10000).optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("mapClassSection"),
    academicYearId: z.string().min(1).max(120),
    gradeLevelId: z.string().min(1).max(120),
    classId: z.string().min(1).max(120),
    pathwayId: z.string().min(1).max(120).nullable().optional(),
    sectionCode: z.string().trim().min(1).max(40),
    displayName: z.string().trim().min(1).max(120).optional(),
    capacity: z.number().int().positive().max(5000).nullable().optional(),
  }),
  z.object({
    action: z.literal("addLevelCategories"),
    academicYearId: z.string().min(1).max(120),
    gradeLevelId: z.string().min(1).max(120),
    categories: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    pathwayId: z.string().min(1).max(120).nullable().optional(),
    capacity: z.number().int().positive().max(5000).nullable().optional(),
  }),
  z.object({
    action: z.literal("recordPromotionDecision"),
    studentId: z.string().min(1).max(120),
    sourceAcademicYearId: z.string().min(1).max(120),
    targetAcademicYearId: z.string().min(1).max(120).nullable().optional(),
    outcome: decisionOutcome,
    targetGradeLevelId: z.string().min(1).max(120).nullable().optional(),
    targetPathwayId: z.string().min(1).max(120).nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({ action: z.literal("previewRollover"), sourceAcademicYearId: z.string().min(1).max(120), targetAcademicYearId: z.string().min(1).max(120), frameworkId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("prepareRollover"), sourceAcademicYearId: z.string().min(1).max(120), targetAcademicYearId: z.string().min(1).max(120), frameworkId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("commitRollover"), rolloverId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("cancelRollover"), rolloverId: z.string().min(1).max(120) }),
]);

async function enrichRolloverPlan(tx: TenantDb, plan: Awaited<ReturnType<typeof previewAcademicYearRollover>>) {
  const studentIds = [...new Set(plan.items.map((item) => item.studentId))];
  const students = studentIds.length
    ? await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, admissionNo: true } })
    : [];
  const byId = new Map(students.map((student) => [student.id, student]));
  return {
    ...plan,
    items: plan.items.map((item) => ({
      ...item,
      studentName: byId.get(item.studentId)?.name ?? "Learner",
      admissionNo: byId.get(item.studentId)?.admissionNo ?? "",
    })),
  };
}

function categoryDisplayName(levelName: string, rawCategory: string) {
  const category = rawCategory.trim();
  if (/^(main|single|none)$/i.test(category)) return levelName;
  if (/^[a-z0-9]$/i.test(category)) return `${levelName}${category.toUpperCase()}`;
  return `${levelName} ${category}`;
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "classes:manage");
      const [state, rollovers] = await Promise.all([
        getAcademicStructureState(tx, session.schoolId),
        tx.$queryRawUnsafe<Array<{
          id: string;
          sourceAcademicYearId: string;
          targetAcademicYearId: string;
          frameworkId: string;
          status: string;
          createdAt: Date;
          validatedAt: Date | null;
          committedAt: Date | null;
          totalItems: number;
          blockedItems: number;
          appliedItems: number;
        }>>(
          `SELECT r."id",r."sourceAcademicYearId",r."targetAcademicYearId",r."frameworkId",r."status",r."createdAt",r."validatedAt",r."committedAt",
                  COUNT(i."id")::int AS "totalItems",
                  COUNT(i."id") FILTER (WHERE i."status"='blocked')::int AS "blockedItems",
                  COUNT(i."id") FILTER (WHERE i."status"='applied')::int AS "appliedItems"
             FROM "AcademicYearRollover" r
             LEFT JOIN "AcademicYearRolloverItem" i ON i."schoolId"=r."schoolId" AND i."rolloverId"=r."id"
            WHERE r."schoolId"=$1
            GROUP BY r."id"
            ORDER BY r."createdAt" DESC
            LIMIT 12`,
          session.schoolId,
        ),
      ]);
      return { state, rollovers };
    });
    return NextResponse.json({ templates: listAcademicStructureTemplates(), ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = schema.parse(await request.json());
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "classes:manage");
      switch (input.action) {
        case "installTemplate":
          return installAcademicStructureTemplate(tx, { schoolId: session.schoolId, actorId: session.userId, templateKey: input.templateKey, name: input.name, makeDefault: input.makeDefault });
        case "createCustomFramework":
          return createCustomAcademicFramework(tx, { schoolId: session.schoolId, actorId: session.userId, name: input.name, makeDefault: input.makeDefault });
        case "addGradeLevel":
          return addGradeLevel(tx, { schoolId: session.schoolId, actorId: session.userId, frameworkId: input.frameworkId, key: input.key, name: input.name, shortName: input.shortName, phase: input.phase, sequence: input.sequence, kind: input.kind, isTerminal: input.isTerminal, pathwayRequired: input.pathwayRequired });
        case "createPathway":
          return createAcademicPathway(tx, { schoolId: session.schoolId, actorId: session.userId, frameworkId: input.frameworkId, code: input.code, name: input.name, category: input.category });
        case "setProgressionRule":
          return setGradeProgressionRule(tx, { schoolId: session.schoolId, actorId: session.userId, frameworkId: input.frameworkId, fromGradeLevelId: input.fromGradeLevelId, toGradeLevelId: input.toGradeLevelId, targetPathwayId: input.targetPathwayId, outcome: input.outcome, priority: input.priority, isDefault: input.isDefault });
        case "mapClassSection":
          return mapClassSection(tx, { schoolId: session.schoolId, actorId: session.userId, academicYearId: input.academicYearId, gradeLevelId: input.gradeLevelId, classId: input.classId, pathwayId: input.pathwayId, sectionCode: input.sectionCode, displayName: input.displayName, capacity: input.capacity });
        case "addLevelCategories": {
          const [year, gradeRows] = await Promise.all([
            tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: session.schoolId }, select: { id: true, isLocked: true } }),
            tx.$queryRawUnsafe<Array<{ id: string; name: string; isActive: boolean }>>(
              `SELECT "id","name","isActive" FROM "GradeLevel" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
              session.schoolId,
              input.gradeLevelId,
            ),
          ]);
          const grade = gradeRows[0];
          if (!year) throw new Error("Academic year not found.");
          if (year.isLocked) throw new Error("Class structure cannot be changed inside a locked academic year.");
          if (!grade || !grade.isActive) throw new Error("Academic grade/level not found or inactive.");

          const categories = [...new Set(input.categories.map((item) => item.trim()).filter(Boolean))];
          const created = [];
          for (const rawCategory of categories) {
            const isMain = /^(main|single|none)$/i.test(rawCategory);
            const sectionCode = isMain ? "MAIN" : rawCategory.toUpperCase();
            const displayName = categoryDisplayName(grade.name, rawCategory);
            let schoolClass = await tx.class.findFirst({ where: { schoolId: session.schoolId, name: displayName }, select: { id: true } });
            if (!schoolClass) {
              schoolClass = await tx.class.create({ data: { schoolId: session.schoolId, name: displayName, level: grade.name }, select: { id: true } });
            }
            await mapClassSection(tx, {
              schoolId: session.schoolId,
              actorId: session.userId,
              academicYearId: input.academicYearId,
              gradeLevelId: input.gradeLevelId,
              classId: schoolClass.id,
              pathwayId: input.pathwayId,
              sectionCode,
              displayName,
              capacity: input.capacity,
            });
            created.push({ classId: schoolClass.id, sectionCode, displayName });
          }
          return { count: created.length, categories: created };
        }
        case "recordPromotionDecision":
          return recordPromotionDecision(tx, { schoolId: session.schoolId, actorId: session.userId, studentId: input.studentId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, outcome: input.outcome, targetGradeLevelId: input.targetGradeLevelId, targetPathwayId: input.targetPathwayId, reason: input.reason });
        case "previewRollover": {
          const plan = await previewAcademicYearRollover(tx, { schoolId: session.schoolId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, frameworkId: input.frameworkId });
          return enrichRolloverPlan(tx, plan);
        }
        case "prepareRollover":
          return prepareAcademicYearRollover(tx, { schoolId: session.schoolId, actorId: session.userId, sourceAcademicYearId: input.sourceAcademicYearId, targetAcademicYearId: input.targetAcademicYearId, frameworkId: input.frameworkId });
        case "commitRollover":
          return commitAcademicYearRollover(tx, { schoolId: session.schoolId, actorId: session.userId, rolloverId: input.rolloverId });
        case "cancelRollover":
          return cancelAcademicYearRollover(tx, { schoolId: session.schoolId, actorId: session.userId, rolloverId: input.rolloverId });
      }
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
