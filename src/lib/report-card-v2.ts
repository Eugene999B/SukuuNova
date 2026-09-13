import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { resolveYearEndAuthority } from "@/lib/academic-session-authority";

export type SchoolDocumentIdentity = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  brandColors: Prisma.JsonValue | null;
  motto: string | null;
  postalAddress: string | null;
  physicalAddress: string | null;
  town: string | null;
  district: string | null;
  region: string | null;
  country: string;
  email: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  website: string | null;
  locationText: string | null;
  departmentName: string | null;
  identifierLabel: string;
  documentFooter: string | null;
};

export type ReportTraitValue = { fieldKey: string; label: string; value: string; displayOrder: number };
export type StructuredPromotion = {
  outcome: "promoted" | "retained" | "graduated" | "transferred" | "withdrawn" | "deferred";
  status: string;
  reason: string | null;
  targetGradeLevelId: string | null;
  targetGradeName: string | null;
  targetPathwayId: string | null;
  targetPathwayName: string | null;
};

type IdentityRow = Omit<SchoolDocumentIdentity, "brandColors"> & { brandColors: Prisma.JsonValue | null };
type PolicyRow = {
  id: string;
  version: number;
  name: string;
  academicYearId: string | null;
  assessmentConfig: Prisma.JsonValue | null;
  reportCardConfig: Prisma.JsonValue | null;
  gradingScale: Prisma.JsonValue | null;
  gradeCaWeight: string;
  gradeExamWeight: string;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

export async function readSchoolDocumentIdentity(tx: TenantDb, schoolId: string): Promise<SchoolDocumentIdentity> {
  const rows = await tx.$queryRawUnsafe<IdentityRow[]>(
    `SELECT s."name",s."uniqueCode",s."logoUrl",s."brandColors",
            p."motto",p."postalAddress",p."physicalAddress",p."town",p."district",p."region",
            COALESCE(p."country",'Ghana') AS "country",p."email",p."phonePrimary",p."phoneSecondary",
            p."website",p."locationText",p."departmentName",COALESCE(p."identifierLabel",'Admission No.') AS "identifierLabel",
            p."documentFooter"
       FROM "School" s
       LEFT JOIN "SchoolDocumentProfile" p ON p."schoolId"=s."id"
      WHERE s."id"=$1 LIMIT 1`,
    schoolId,
  );
  const identity = rows[0];
  if (!identity) throw new AppError("School identity could not be loaded.", 404, "SCHOOL_NOT_FOUND");
  return identity;
}

export async function updateSchoolDocumentIdentity(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  motto?: string | null;
  postalAddress?: string | null;
  physicalAddress?: string | null;
  town?: string | null;
  district?: string | null;
  region?: string | null;
  country?: string | null;
  email?: string | null;
  phonePrimary?: string | null;
  phoneSecondary?: string | null;
  website?: string | null;
  locationText?: string | null;
  departmentName?: string | null;
  identifierLabel?: string | null;
  documentFooter?: string | null;
}) {
  const identifierLabel = clean(input.identifierLabel) ?? "Admission No.";
  const country = clean(input.country) ?? "Ghana";
  await tx.$executeRawUnsafe(
    `INSERT INTO "SchoolDocumentProfile" (
       "schoolId","motto","postalAddress","physicalAddress","town","district","region","country","email",
       "phonePrimary","phoneSecondary","website","locationText","departmentName","identifierLabel","documentFooter","updatedBy","updatedAt"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_TIMESTAMP)
     ON CONFLICT ("schoolId") DO UPDATE SET
       "motto"=EXCLUDED."motto","postalAddress"=EXCLUDED."postalAddress","physicalAddress"=EXCLUDED."physicalAddress",
       "town"=EXCLUDED."town","district"=EXCLUDED."district","region"=EXCLUDED."region","country"=EXCLUDED."country",
       "email"=EXCLUDED."email","phonePrimary"=EXCLUDED."phonePrimary","phoneSecondary"=EXCLUDED."phoneSecondary",
       "website"=EXCLUDED."website","locationText"=EXCLUDED."locationText","departmentName"=EXCLUDED."departmentName",
       "identifierLabel"=EXCLUDED."identifierLabel","documentFooter"=EXCLUDED."documentFooter","updatedBy"=EXCLUDED."updatedBy","updatedAt"=CURRENT_TIMESTAMP`,
    input.schoolId,
    clean(input.motto), clean(input.postalAddress), clean(input.physicalAddress), clean(input.town), clean(input.district),
    clean(input.region), country, clean(input.email), clean(input.phonePrimary), clean(input.phoneSecondary), clean(input.website),
    clean(input.locationText), clean(input.departmentName), identifierLabel, clean(input.documentFooter), input.actorId,
  );
  return readSchoolDocumentIdentity(tx, input.schoolId);
}

export async function readActiveReportingPolicy(tx: TenantDb, schoolId: string, academicYearId?: string | null) {
  const rows = await tx.$queryRawUnsafe<PolicyRow[]>(
    `SELECT "id","version","name","academicYearId","assessmentConfig","reportCardConfig","gradingScale",
            "gradeCaWeight"::text,"gradeExamWeight"::text
       FROM "AcademicReportingPolicy"
      WHERE "schoolId"=$1 AND "status"='active' AND "isDefault"=true
        AND ("academicYearId"=$2 OR "academicYearId" IS NULL)
      ORDER BY ("academicYearId" IS NOT NULL) DESC,"version" DESC LIMIT 1`,
    schoolId, academicYearId ?? null,
  );
  return rows[0] ?? null;
}

export async function createReportingPolicyVersion(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  academicYearId?: string | null;
  name?: string | null;
  assessmentConfig: Prisma.JsonValue | null;
  reportCardConfig: Prisma.JsonValue | null;
  gradingScale: Prisma.JsonValue | null;
  gradeCaWeight: number;
  gradeExamWeight: number;
}) {
  const yearId = input.academicYearId ?? null;
  await tx.$executeRawUnsafe(
    `UPDATE "AcademicReportingPolicy" SET "status"='archived',"isDefault"=false
      WHERE "schoolId"=$1 AND "status"='active' AND "isDefault"=true
        AND (("academicYearId" IS NULL AND $2::text IS NULL) OR "academicYearId"=$2)`,
    input.schoolId, yearId,
  );
  const versions = await tx.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT COALESCE(MAX("version"),0)::int + 1 AS "version" FROM "AcademicReportingPolicy"
      WHERE "schoolId"=$1 AND (("academicYearId" IS NULL AND $2::text IS NULL) OR "academicYearId"=$2)`,
    input.schoolId, yearId,
  );
  const version = versions[0]?.version ?? 1;
  const id = createId();
  const name = clean(input.name) ?? `School Reporting Policy v${version}`;
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicReportingPolicy" (
       "id","schoolId","academicYearId","version","name","status","isDefault","assessmentConfig","reportCardConfig",
       "gradingScale","gradeCaWeight","gradeExamWeight","createdBy"
     ) VALUES ($1,$2,$3,$4,$5,'active',true,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)`,
    id, input.schoolId, yearId, version, name,
    input.assessmentConfig == null ? null : JSON.stringify(input.assessmentConfig),
    input.reportCardConfig == null ? null : JSON.stringify(input.reportCardConfig),
    input.gradingScale == null ? null : JSON.stringify(input.gradingScale),
    input.gradeCaWeight, input.gradeExamWeight, input.actorId,
  );
  return { id, version, name, academicYearId: yearId };
}

export async function reportCardTraits(tx: TenantDb, schoolId: string, reportCardId: string): Promise<ReportTraitValue[]> {
  return tx.$queryRawUnsafe<ReportTraitValue[]>(
    `SELECT "fieldKey","label","value","displayOrder" FROM "ReportCardTraitValue"
      WHERE "schoolId"=$1 AND "reportCardId"=$2 ORDER BY "displayOrder","label"`,
    schoolId, reportCardId,
  );
}

export async function replaceReportCardTraits(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  reportCardId: string;
  values: ReportTraitValue[];
}) {
  await tx.$executeRawUnsafe(`DELETE FROM "ReportCardTraitValue" WHERE "schoolId"=$1 AND "reportCardId"=$2`, input.schoolId, input.reportCardId);
  for (const [index, entry] of input.values.entries()) {
    const fieldKey = entry.fieldKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const label = entry.label.trim();
    const value = entry.value.trim();
    if (!fieldKey || !label || !value) continue;
    await tx.$executeRawUnsafe(
      `INSERT INTO "ReportCardTraitValue" ("schoolId","reportCardId","fieldKey","label","value","displayOrder","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      input.schoolId, input.reportCardId, fieldKey, label, value, Number.isFinite(entry.displayOrder) ? entry.displayOrder : index, input.actorId,
    );
  }
}

export async function liveReportDocumentContext(tx: TenantDb, input: {
  schoolId: string;
  reportId: string;
  studentId: string;
  termId: string;
  classId: string;
}) {
  const [identity, termRows, classRollRows, traits, settings] = await Promise.all([
    readSchoolDocumentIdentity(tx, input.schoolId),
    tx.$queryRawUnsafe<Array<{ academicYearId: string; endDate: Date }>>(
      `SELECT t."academicYearId",t."endDate" FROM "Term" t
        WHERE t."schoolId"=$1 AND t."id"=$2 LIMIT 1`, input.schoolId, input.termId),
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(DISTINCT "studentId")::bigint AS "count" FROM "Enrollment"
        WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "status" IN ('draft','ready','confirmed')`,
      input.schoolId, input.termId, input.classId),
    reportCardTraits(tx, input.schoolId, input.reportId),
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { reportCardConfig: true, reportCardTemplateId: true } }),
  ]);
  const term = termRows[0];
  const reportingPolicy = term ? await readActiveReportingPolicy(tx, input.schoolId, term.academicYearId) : null;
  const workflow = readReportWorkflowConfig(settings?.reportCardConfig, settings?.reportCardTemplateId);
  const yearEndAuthority = term ? await resolveYearEndAuthority(tx, {
    schoolId: input.schoolId,
    termId: input.termId,
    legacyFinalTermNumber: workflow.finalTermNumber,
  }) : null;

  let reopeningDate: Date | null = null;
  if (term) {
    const next = await tx.$queryRawUnsafe<Array<{ calendarDate: Date }>>(
      `SELECT "calendarDate" FROM "SchoolCalendarDay"
        WHERE "schoolId"=$1 AND "calendarDate">$2::date AND "isInstructional"=true
        ORDER BY "calendarDate" LIMIT 1`, input.schoolId, term.endDate,
    );
    reopeningDate = next[0]?.calendarDate ?? null;
    if (!reopeningDate) {
      const fallback = await tx.term.findFirst({
        where: { schoolId: input.schoolId, startDate: { gt: term.endDate } }, orderBy: { startDate: "asc" }, select: { startDate: true },
      });
      reopeningDate = fallback?.startDate ?? null;
    }
  }

  let promotion: StructuredPromotion | null = null;
  if (term && yearEndAuthority?.isYearEnd) {
    const rows = await tx.$queryRawUnsafe<StructuredPromotion[]>(
      `SELECT d."outcome",d."status",d."reason",d."targetGradeLevelId",g."name" AS "targetGradeName",
              d."targetPathwayId",p."name" AS "targetPathwayName"
         FROM "PromotionDecision" d
         LEFT JOIN "GradeLevel" g ON g."id"=d."targetGradeLevelId" AND g."schoolId"=d."schoolId"
         LEFT JOIN "AcademicPathway" p ON p."id"=d."targetPathwayId" AND p."schoolId"=d."schoolId"
        WHERE d."schoolId"=$1 AND d."studentId"=$2 AND d."sourceAcademicYearId"=$3 LIMIT 1`,
      input.schoolId, input.studentId, term.academicYearId,
    );
    promotion = rows[0] ?? null;
  }
  const teacherRows = term ? await tx.$queryRawUnsafe<Array<{ userId: string; name: string }>>(
    `SELECT u."id" AS "userId",u."name"
       FROM "ClassSection" cs
       JOIN "ClassSectionStaffAssignment" a ON a."schoolId"=cs."schoolId" AND a."classSectionId"=cs."id"
       JOIN "User" u ON u."schoolId"=a."schoolId" AND u."id"=a."userId"
      WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."classId"=$3
        AND a."academicYearId"=$2 AND a."status"='active' AND a."responsibility"='class_teacher' AND a."isPrimary"=true
      LIMIT 1`, input.schoolId, term.academicYearId, input.classId,
  ) : [];
  return {
    schoolIdentity: identity,
    reportingPolicy: reportingPolicy ? { id: reportingPolicy.id, version: reportingPolicy.version, name: reportingPolicy.name } : null,
    gradingScale: reportingPolicy?.gradingScale ?? null,
    classRoll: Number(classRollRows[0]?.count ?? 0),
    yearEndSession: Boolean(yearEndAuthority?.isYearEnd),
    calendar: { vacationDate: term?.endDate ?? null, reopeningDate },
    structuredPromotion: promotion,
    reportTraits: traits,
    classTeacherIdentity: teacherRows[0] ? { ...teacherRows[0], source: "annual_class_section" as const } : null,
  };
}
