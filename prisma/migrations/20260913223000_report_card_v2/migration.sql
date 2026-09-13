-- Report Card V2: official school identity, versioned reporting policy,
-- academic-year class-teacher responsibility, learner report traits and immutable issue context.
-- Additive by design: existing SchoolSettings, Class.classTeacherId and report snapshots remain compatible.

CREATE TABLE "SchoolDocumentProfile" (
  "schoolId" TEXT NOT NULL,
  "motto" TEXT,
  "postalAddress" TEXT,
  "physicalAddress" TEXT,
  "town" TEXT,
  "district" TEXT,
  "region" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Ghana',
  "email" TEXT,
  "phonePrimary" TEXT,
  "phoneSecondary" TEXT,
  "website" TEXT,
  "locationText" TEXT,
  "departmentName" TEXT,
  "identifierLabel" TEXT NOT NULL DEFAULT 'Admission No.',
  "documentFooter" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolDocumentProfile_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "SchoolDocumentProfile_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolDocumentProfile_updatedBy_fkey" FOREIGN KEY ("updatedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AcademicReportingPolicy" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isDefault" BOOLEAN NOT NULL DEFAULT true,
  "assessmentConfig" JSONB,
  "reportCardConfig" JSONB,
  "gradingScale" JSONB,
  "gradeCaWeight" DECIMAL(5,2) NOT NULL,
  "gradeExamWeight" DECIMAL(5,2) NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicReportingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicReportingPolicy_version_check" CHECK ("version" > 0),
  CONSTRAINT "AcademicReportingPolicy_status_check" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "AcademicReportingPolicy_weight_check" CHECK ("gradeCaWeight" >= 0 AND "gradeExamWeight" >= 0 AND "gradeCaWeight" + "gradeExamWeight" = 100),
  CONSTRAINT "AcademicReportingPolicy_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicReportingPolicy_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicReportingPolicy_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicReportingPolicy_id_schoolId_key" ON "AcademicReportingPolicy"("id","schoolId");
CREATE UNIQUE INDEX "AcademicReportingPolicy_school_version_global_key" ON "AcademicReportingPolicy"("schoolId","version") WHERE "academicYearId" IS NULL;
CREATE UNIQUE INDEX "AcademicReportingPolicy_school_year_version_key" ON "AcademicReportingPolicy"("schoolId","academicYearId","version") WHERE "academicYearId" IS NOT NULL;
CREATE UNIQUE INDEX "AcademicReportingPolicy_one_global_default" ON "AcademicReportingPolicy"("schoolId") WHERE "academicYearId" IS NULL AND "isDefault"=true AND "status"='active';
CREATE UNIQUE INDEX "AcademicReportingPolicy_one_year_default" ON "AcademicReportingPolicy"("schoolId","academicYearId") WHERE "academicYearId" IS NOT NULL AND "isDefault"=true AND "status"='active';
CREATE INDEX "AcademicReportingPolicy_school_status_idx" ON "AcademicReportingPolicy"("schoolId","status","createdAt");

CREATE TABLE "ClassSectionStaffAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "classSectionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "responsibility" TEXT NOT NULL DEFAULT 'class_teacher',
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassSectionStaffAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassSectionStaffAssignment_responsibility_check" CHECK ("responsibility" IN ('class_teacher','assistant_class_teacher')),
  CONSTRAINT "ClassSectionStaffAssignment_status_check" CHECK ("status" IN ('active','ended')),
  CONSTRAINT "ClassSectionStaffAssignment_dates_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "ClassSectionStaffAssignment_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSectionStaffAssignment_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSectionStaffAssignment_section_fkey" FOREIGN KEY ("classSectionId","schoolId") REFERENCES "ClassSection"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClassSectionStaffAssignment_user_fkey" FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassSectionStaffAssignment_id_schoolId_key" ON "ClassSectionStaffAssignment"("id","schoolId");
CREATE UNIQUE INDEX "ClassSectionStaffAssignment_active_person_role_key" ON "ClassSectionStaffAssignment"("schoolId","classSectionId","userId","responsibility") WHERE "status"='active';
CREATE UNIQUE INDEX "ClassSectionStaffAssignment_one_primary_teacher" ON "ClassSectionStaffAssignment"("schoolId","classSectionId") WHERE "status"='active' AND "responsibility"='class_teacher' AND "isPrimary"=true;
CREATE INDEX "ClassSectionStaffAssignment_user_year_idx" ON "ClassSectionStaffAssignment"("schoolId","userId","academicYearId","status");

CREATE TABLE "ReportCardTraitValue" (
  "schoolId" TEXT NOT NULL,
  "reportCardId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportCardTraitValue_pkey" PRIMARY KEY ("reportCardId","fieldKey"),
  CONSTRAINT "ReportCardTraitValue_order_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "ReportCardTraitValue_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportCardTraitValue_report_fkey" FOREIGN KEY ("reportCardId","schoolId") REFERENCES "ReportCard"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardTraitValue_updatedBy_fkey" FOREIGN KEY ("updatedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReportCardTraitValue_school_report_idx" ON "ReportCardTraitValue"("schoolId","reportCardId","displayOrder");

-- Guard annual class-teacher assignments against cross-year ClassSection data.
CREATE OR REPLACE FUNCTION sukuunova_guard_class_section_staff_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE section_year TEXT;
BEGIN
  SELECT "academicYearId" INTO section_year
    FROM "ClassSection"
   WHERE "id"=NEW."classSectionId" AND "schoolId"=NEW."schoolId";
  IF section_year IS NULL OR section_year IS DISTINCT FROM NEW."academicYearId" THEN
    RAISE EXCEPTION 'Class teacher assignment must use the ClassSection academic year' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='ended' AND NEW."endedAt" IS NULL THEN
    NEW."endedAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$;
CREATE TRIGGER "ClassSectionStaffAssignment_year_guard"
BEFORE INSERT OR UPDATE ON "ClassSectionStaffAssignment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_class_section_staff_assignment();

-- Canonical school document identity starts as a blank profile over existing School identity.
INSERT INTO "SchoolDocumentProfile" ("schoolId")
SELECT s."id" FROM "School" s
ON CONFLICT ("schoolId") DO NOTHING;

-- Preserve the existing report/grading configuration as version 1 instead of silently replacing it.
INSERT INTO "AcademicReportingPolicy" (
  "id","schoolId","academicYearId","version","name","status","isDefault",
  "assessmentConfig","reportCardConfig","gradingScale","gradeCaWeight","gradeExamWeight","createdBy"
)
SELECT 'arp_' || md5(ss."schoolId" || ':global:1'), ss."schoolId", NULL, 1,
       'School Reporting Policy v1', 'active', true,
       ss."assessmentConfig", ss."reportCardConfig", ss."gradingScale",
       ss."gradeCaWeight", ss."gradeExamWeight", NULL
FROM "SchoolSettings" ss
WHERE NOT EXISTS (
  SELECT 1 FROM "AcademicReportingPolicy" p
   WHERE p."schoolId"=ss."schoolId" AND p."academicYearId" IS NULL
);

-- Bridge legacy Class.classTeacherId into every mapped annual ClassSection.
INSERT INTO "ClassSectionStaffAssignment" (
  "id","schoolId","academicYearId","classSectionId","userId","responsibility","isPrimary","status","startedAt"
)
SELECT 'cssa_' || md5(cs."schoolId" || ':' || cs."id" || ':' || c."classTeacherId"),
       cs."schoolId", cs."academicYearId", cs."id", c."classTeacherId",
       'class_teacher', true, 'active', ay."startDate"
FROM "ClassSection" cs
JOIN "Class" c ON c."id"=cs."classId" AND c."schoolId"=cs."schoolId"
JOIN "AcademicYear" ay ON ay."id"=cs."academicYearId" AND ay."schoolId"=cs."schoolId"
WHERE c."classTeacherId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- When an official report is approved, freeze the institutional/policy/year-end context into
-- calculationSnapshot. This runs after the existing calculation/signature freeze and before the
-- approved row is stored, so future school-setting changes cannot rewrite a historical document.
CREATE OR REPLACE FUNCTION sukuunova_freeze_report_card_v2_context()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  school_identity JSONB;
  reporting_policy JSONB;
  grading_scale JSONB;
  class_id TEXT;
  class_teacher JSONB;
  class_roll INTEGER := 0;
  term_year TEXT;
  term_end DATE;
  is_year_end BOOLEAN := false;
  reopening_date DATE;
  promotion_context JSONB;
  traits JSONB;
BEGIN
  IF NEW."status"='approved' AND OLD."status" IS DISTINCT FROM 'approved' THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'name', s."name",
      'uniqueCode', s."uniqueCode",
      'logoUrl', s."logoUrl",
      'brandColors', s."brandColors",
      'motto', p."motto",
      'postalAddress', p."postalAddress",
      'physicalAddress', p."physicalAddress",
      'town', p."town",
      'district', p."district",
      'region', p."region",
      'country', p."country",
      'email', p."email",
      'phonePrimary', p."phonePrimary",
      'phoneSecondary', p."phoneSecondary",
      'website', p."website",
      'locationText', p."locationText",
      'departmentName', p."departmentName",
      'identifierLabel', p."identifierLabel",
      'documentFooter', p."documentFooter"
    )) INTO school_identity
    FROM "School" s
    LEFT JOIN "SchoolDocumentProfile" p ON p."schoolId"=s."id"
    WHERE s."id"=NEW."schoolId";

    SELECT t."academicYearId", t."endDate"::date
      INTO term_year, term_end
      FROM "Term" t
     WHERE t."id"=NEW."termId" AND t."schoolId"=NEW."schoolId";

    SELECT COALESCE(asp."isYearEnd", false)
      INTO is_year_end
      FROM "AcademicSessionPolicy" asp
     WHERE asp."schoolId"=NEW."schoolId" AND asp."termId"=NEW."termId"
     LIMIT 1;
    is_year_end := COALESCE(is_year_end, false);

    SELECT jsonb_build_object('id',p."id",'version',p."version",'name',p."name"), p."gradingScale"
      INTO reporting_policy, grading_scale
      FROM "AcademicReportingPolicy" p
     WHERE p."schoolId"=NEW."schoolId" AND p."status"='active' AND p."isDefault"=true
       AND (p."academicYearId"=term_year OR p."academicYearId" IS NULL)
     ORDER BY (p."academicYearId" IS NOT NULL) DESC, p."version" DESC
     LIMIT 1;

    IF grading_scale IS NULL THEN
      SELECT ss."gradingScale" INTO grading_scale FROM "SchoolSettings" ss WHERE ss."schoolId"=NEW."schoolId";
    END IF;

    class_id := COALESCE(NEW."calculationSnapshot"->>'classId', NULL);
    IF class_id IS NULL THEN
      SELECT e."classId" INTO class_id
        FROM "Enrollment" e
       WHERE e."schoolId"=NEW."schoolId" AND e."termId"=NEW."termId" AND e."studentId"=NEW."studentId"
         AND e."status" IN ('draft','ready','confirmed')
       ORDER BY CASE e."status" WHEN 'confirmed' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END
       LIMIT 1;
    END IF;

    IF class_id IS NOT NULL THEN
      SELECT COUNT(DISTINCT e."studentId")::int INTO class_roll
        FROM "Enrollment" e
       WHERE e."schoolId"=NEW."schoolId" AND e."termId"=NEW."termId" AND e."classId"=class_id
         AND e."status" IN ('draft','ready','confirmed');

      SELECT jsonb_build_object('userId',u."id",'name',u."name",'source','annual_class_section')
        INTO class_teacher
        FROM "ClassSection" cs
        JOIN "ClassSectionStaffAssignment" a ON a."schoolId"=cs."schoolId" AND a."classSectionId"=cs."id"
        JOIN "User" u ON u."schoolId"=a."schoolId" AND u."id"=a."userId"
       WHERE cs."schoolId"=NEW."schoolId" AND cs."academicYearId"=term_year AND cs."classId"=class_id
         AND a."academicYearId"=term_year AND a."status"='active'
         AND a."responsibility"='class_teacher' AND a."isPrimary"=true
       LIMIT 1;
    END IF;

    SELECT d."calendarDate" INTO reopening_date
      FROM "SchoolCalendarDay" d
     WHERE d."schoolId"=NEW."schoolId" AND d."calendarDate" > term_end AND d."isInstructional"=true
     ORDER BY d."calendarDate" ASC LIMIT 1;
    IF reopening_date IS NULL THEN
      SELECT t."startDate"::date INTO reopening_date
        FROM "Term" t
       WHERE t."schoolId"=NEW."schoolId" AND t."startDate"::date > term_end
       ORDER BY t."startDate" ASC LIMIT 1;
    END IF;

    IF is_year_end THEN
      SELECT jsonb_strip_nulls(jsonb_build_object(
        'outcome',pd."outcome",
        'status',pd."status",
        'reason',pd."reason",
        'targetGradeLevelId',pd."targetGradeLevelId",
        'targetGradeName',gl."name",
        'targetPathwayId',pd."targetPathwayId",
        'targetPathwayName',ap."name"
      )) INTO promotion_context
      FROM "PromotionDecision" pd
      LEFT JOIN "GradeLevel" gl ON gl."id"=pd."targetGradeLevelId" AND gl."schoolId"=pd."schoolId"
      LEFT JOIN "AcademicPathway" ap ON ap."id"=pd."targetPathwayId" AND ap."schoolId"=pd."schoolId"
      WHERE pd."schoolId"=NEW."schoolId" AND pd."studentId"=NEW."studentId" AND pd."sourceAcademicYearId"=term_year
      LIMIT 1;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fieldKey',v."fieldKey",'label',v."label",'value',v."value",'displayOrder',v."displayOrder"
    ) ORDER BY v."displayOrder",v."label"), '[]'::jsonb)
      INTO traits
      FROM "ReportCardTraitValue" v
     WHERE v."schoolId"=NEW."schoolId" AND v."reportCardId"=NEW."id";

    NEW."calculationSnapshot" := COALESCE(NEW."calculationSnapshot", '{}'::jsonb) || jsonb_build_object(
      'documentContextVersion', 2,
      'schoolIdentity', COALESCE(school_identity, '{}'::jsonb),
      'reportingPolicy', reporting_policy,
      'gradingScale', grading_scale,
      'classRoll', COALESCE(class_roll,0),
      'yearEndSession', is_year_end,
      'calendar', jsonb_strip_nulls(jsonb_build_object('vacationDate',term_end,'reopeningDate',reopening_date)),
      'structuredPromotion', promotion_context,
      'reportTraits', COALESCE(traits,'[]'::jsonb),
      'documentContextFrozenAt', CURRENT_TIMESTAMP
    );
    IF class_teacher IS NOT NULL THEN
      NEW."calculationSnapshot" := NEW."calculationSnapshot" || jsonb_build_object(
        'classTeacherIdentity', class_teacher,
        'classTeacherName', class_teacher->>'name'
      );
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "ReportCard_freeze_v2_context" ON "ReportCard";
CREATE TRIGGER "ReportCard_freeze_v2_context"
BEFORE UPDATE OF "status" ON "ReportCard"
FOR EACH ROW EXECUTE FUNCTION sukuunova_freeze_report_card_v2_context();

-- Tenant isolation for every new school-owned table.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['SchoolDocumentProfile','AcademicReportingPolicy','ClassSectionStaffAssignment','ReportCardTraitValue'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), '''')) WITH CHECK ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), ''''))',
      lower(table_name) || '_tenant', table_name
    );
  END LOOP;
END $$;
