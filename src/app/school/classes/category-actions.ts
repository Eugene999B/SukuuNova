"use server";

import { appendSchoolAudit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { mapClassSection } from "@/lib/academic-structure-service";
import { provisionOfficialTemplateClasses } from "@/lib/academic-class-provisioning";

export type CategoryActionResult = { ok: true; message: string } | { ok: false; message: string };

type SectionContext = {
  id: string;
  gradeLevelId: string;
  pathwayId: string | null;
  sectionCode: string;
  displayName: string;
  gradeName: string;
};

function safeMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && /unique constraint/i.test(error.message)) return "One of those class categories already exists.";
  return "We could not update the class categories.";
}

function normaliseCategories(values: string[]) {
  const seen = new Set<string>();
  const result: Array<{ raw: string; code: string }> = [];
  for (const value of values) {
    const raw = value.trim();
    if (!raw) continue;
    if (raw.length > 20) throw new AppError("Keep each category name within 20 characters.", 400, "CLASS_CATEGORY_INVALID");
    if (!/^[a-z0-9][a-z0-9 _-]*$/i.test(raw)) throw new AppError("Categories can use letters, numbers, spaces, dashes and underscores only.", 400, "CLASS_CATEGORY_INVALID");
    const code = raw.toUpperCase().replace(/\s+/g, "_");
    if (seen.has(code)) continue;
    seen.add(code);
    result.push({ raw, code });
  }
  return result;
}

function displayName(gradeName: string, raw: string) {
  return /^[a-z0-9]$/i.test(raw) ? `${gradeName}${raw.toUpperCase()}` : `${gradeName} ${raw}`;
}

export async function addClassCategories(input: { classId: string; categories: string[] }): Promise<CategoryActionResult> {
  const session = await requireSchoolSession();
  let categories: Array<{ raw: string; code: string }>;
  try {
    categories = normaliseCategories(input.categories);
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
  if (!categories.length) return { ok: false, message: "Enter at least one category, for example A, B." };

  return withTenant(session.schoolId, async (tx) => {
    try {
      await requirePermission(tx, session.userId, "classes:manage");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`class-categories:${session.schoolId}:${input.classId}`}))`;

      const schoolClass = await tx.class.findFirst({
        where: { id: input.classId, schoolId: session.schoolId },
        select: { id: true, name: true, level: true },
      });
      if (!schoolClass) return { ok: false, message: "Class not found." };

      const year = await tx.academicYear.findFirst({
        where: { schoolId: session.schoolId, isLocked: false },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true },
      });
      if (!year) return { ok: false, message: "Create or unlock an academic year before splitting a class." };

      await provisionOfficialTemplateClasses(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        academicYearId: year.id,
      });

      const sectionRows = await tx.$queryRawUnsafe<SectionContext[]>(
        `SELECT cs."id",cs."gradeLevelId",cs."pathwayId",cs."sectionCode",cs."displayName",g."name" AS "gradeName"
           FROM "ClassSection" cs
           JOIN "GradeLevel" g ON g."id"=cs."gradeLevelId" AND g."schoolId"=cs."schoolId"
          WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."classId"=$3 AND cs."isActive"=true
          LIMIT 1`,
        session.schoolId,
        year.id,
        schoolClass.id,
      );
      const section = sectionRows[0];
      if (!section) return { ok: false, message: "This class is not connected to the installed academic structure yet." };

      const siblings = await tx.$queryRawUnsafe<Array<{ id: string; classId: string; sectionCode: string; displayName: string }>>(
        `SELECT "id","classId","sectionCode","displayName" FROM "ClassSection"
          WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "gradeLevelId"=$3 AND "isActive"=true
          ORDER BY "displayName"`,
        session.schoolId,
        year.id,
        section.gradeLevelId,
      );
      const existingCodes = new Set(siblings.map((item) => item.sectionCode.toUpperCase()));
      const isCurrentlyUnsplit = siblings.length === 1 && siblings[0].classId === schoolClass.id && siblings[0].sectionCode.toUpperCase() === "MAIN";

      if (isCurrentlyUnsplit && categories.length < 2) {
        return { ok: false, message: "To split a class for the first time, enter at least two categories, for example A, B." };
      }

      let created = 0;
      let firstWasBase = false;
      for (let index = 0; index < categories.length; index += 1) {
        const category = categories[index];
        if (existingCodes.has(category.code)) continue;
        const categoryName = displayName(section.gradeName, category.raw);

        if (isCurrentlyUnsplit && !firstWasBase) {
          await mapClassSection(tx, {
            schoolId: session.schoolId,
            actorId: session.userId,
            academicYearId: year.id,
            gradeLevelId: section.gradeLevelId,
            classId: schoolClass.id,
            pathwayId: section.pathwayId,
            sectionCode: category.code,
            displayName: categoryName,
            capacity: null,
          });
          firstWasBase = true;
          existingCodes.add(category.code);
          created += 1;
          continue;
        }

        let categoryClass = await tx.class.findFirst({
          where: { schoolId: session.schoolId, name: categoryName },
          select: { id: true },
        });
        if (!categoryClass) {
          categoryClass = await tx.class.create({
            data: { schoolId: session.schoolId, name: categoryName, level: section.gradeName },
            select: { id: true },
          });
        }

        await mapClassSection(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          academicYearId: year.id,
          gradeLevelId: section.gradeLevelId,
          classId: categoryClass.id,
          pathwayId: section.pathwayId,
          sectionCode: category.code,
          displayName: categoryName,
          capacity: null,
        });
        existingCodes.add(category.code);
        created += 1;
      }

      if (!created) return { ok: true, message: "Those categories already exist for this class." };

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "class.categories_updated",
        entityType: "Class",
        entityId: schoolClass.id,
        after: { academicYearId: year.id, gradeLevelId: section.gradeLevelId, categories: [...existingCodes] },
      });

      return {
        ok: true,
        message: isCurrentlyUnsplit
          ? `${section.gradeName} is now split into ${categories.map((item) => item.code).join(", ")}. Existing learners stay in the first category until you move them.`
          : `${created} categor${created === 1 ? "y was" : "ies were"} added to ${section.gradeName}.`,
      };
    } catch (error) {
      return { ok: false, message: safeMessage(error) };
    }
  });
}
