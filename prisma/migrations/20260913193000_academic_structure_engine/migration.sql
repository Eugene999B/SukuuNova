-- Academic Structure Engine
--
-- Additive, non-destructive academic hierarchy above the existing Class and
-- Enrollment records. Existing term Enrollment remains the canonical historical
-- student+term+class fact while this layer adds grade semantics, sections,
-- pathways, year enrolment, progression and auditable rollover planning.

CREATE TABLE "AcademicFramework" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "templateKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicFramework_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicFramework_status_check" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "AcademicFramework_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicFramework_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicFramework_id_schoolId_key" ON "AcademicFramework"("id","schoolId");
CREATE UNIQUE INDEX "AcademicFramework_schoolId_name_key" ON "AcademicFramework"("schoolId","name");
CREATE UNIQUE INDEX "AcademicFramework_one_default_per_school" ON "AcademicFramework"("schoolId") WHERE "isDefault" = true AND "status" = 'active';
CREATE INDEX "AcademicFramework_schoolId_status_idx" ON "AcademicFramework"("schoolId","status");

CREATE TABLE "GradeLevel" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "phase" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'grade',
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "pathwayRequired" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradeLevel_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "GradeLevel_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GradeLevel_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GradeLevel_id_schoolId_key" ON "GradeLevel"("id","schoolId");
CREATE UNIQUE INDEX "GradeLevel_frameworkId_key_key" ON "GradeLevel"("frameworkId","key");
CREATE INDEX "GradeLevel_schoolId_frameworkId_sequence_idx" ON "GradeLevel"("schoolId","frameworkId","sequence");

CREATE TABLE "AcademicPathway" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicPathway_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicPathway_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicPathway_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicPathway_id_schoolId_key" ON "AcademicPathway"("id","schoolId");
CREATE UNIQUE INDEX "AcademicPathway_frameworkId_code_key" ON "AcademicPathway"("frameworkId","code");
CREATE INDEX "AcademicPathway_schoolId_frameworkId_idx" ON "AcademicPathway"("schoolId","frameworkId");

CREATE TABLE "GradeProgressionRule" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "fromGradeLevelId" TEXT NOT NULL,
  "toGradeLevelId" TEXT,
  "targetPathwayId" TEXT,
  "outcome" TEXT NOT NULL DEFAULT 'advance',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "conditions" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeProgressionRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradeProgressionRule_outcome_check" CHECK ("outcome" IN ('advance','complete','exit')),
  CONSTRAINT "GradeProgressionRule_target_check" CHECK (("outcome" = 'advance' AND "toGradeLevelId" IS NOT NULL) OR ("outcome" IN ('complete','exit') AND "toGradeLevelId" IS NULL)),
  CONSTRAINT "GradeProgressionRule_no_self_loop" CHECK ("toGradeLevelId" IS NULL OR "toGradeLevelId" <> "fromGradeLevelId"),
  CONSTRAINT "GradeProgressionRule_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GradeProgressionRule_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GradeProgressionRule_from_grade_fkey" FOREIGN KEY ("fromGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GradeProgressionRule_to_grade_fkey" FOREIGN KEY ("toGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GradeProgressionRule_pathway_fkey" FOREIGN KEY ("targetPathwayId","schoolId") REFERENCES "AcademicPathway"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GradeProgressionRule_id_schoolId_key" ON "GradeProgressionRule"("id","schoolId");
CREATE UNIQUE INDEX "GradeProgressionRule_one_default_per_grade" ON "GradeProgressionRule"("schoolId","fromGradeLevelId") WHERE "isDefault" = true AND "isActive" = true;
CREATE INDEX "GradeProgressionRule_schoolId_framework_from_idx" ON "GradeProgressionRule"("schoolId","frameworkId","fromGradeLevelId","priority");

CREATE TABLE "ClassSection" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "pathwayId" TEXT,
  "sectionCode" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "capacity" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassSection_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "ClassSection_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSection_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSection_grade_fkey" FOREIGN KEY ("gradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSection_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSection_pathway_fkey" FOREIGN KEY ("pathwayId","schoolId") REFERENCES "AcademicPathway"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassSection_id_schoolId_key" ON "ClassSection"("id","schoolId");
CREATE UNIQUE INDEX "ClassSection_year_class_key" ON "ClassSection"("schoolId","academicYearId","classId");
CREATE UNIQUE INDEX "ClassSection_generic_code_key" ON "ClassSection"("schoolId","academicYearId","gradeLevelId","sectionCode") WHERE "pathwayId" IS NULL;
CREATE UNIQUE INDEX "ClassSection_pathway_code_key" ON "ClassSection"("schoolId","academicYearId","gradeLevelId","pathwayId","sectionCode") WHERE "pathwayId" IS NOT NULL;
CREATE INDEX "ClassSection_schoolId_year_grade_idx" ON "ClassSection"("schoolId","academicYearId","gradeLevelId","isActive");

CREATE TABLE "StudentYearEnrollment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "pathwayId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentYearEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentYearEnrollment_status_check" CHECK ("status" IN ('planned','active','completed','retained','withdrawn','transferred','graduated')),
  CONSTRAINT "StudentYearEnrollment_source_check" CHECK ("source" IN ('admission','rollover','manual','import','term_enrollment')),
  CONSTRAINT "StudentYearEnrollment_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_grade_fkey" FOREIGN KEY ("gradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_pathway_fkey" FOREIGN KEY ("pathwayId","schoolId") REFERENCES "AcademicPathway"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentYearEnrollment_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudentYearEnrollment_id_schoolId_key" ON "StudentYearEnrollment"("id","schoolId");
CREATE UNIQUE INDEX "StudentYearEnrollment_student_year_key" ON "StudentYearEnrollment"("schoolId","studentId","academicYearId");
CREATE INDEX "StudentYearEnrollment_school_year_grade_status_idx" ON "StudentYearEnrollment"("schoolId","academicYearId","gradeLevelId","status");

CREATE TABLE "PromotionDecision" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "sourceAcademicYearId" TEXT NOT NULL,
  "targetAcademicYearId" TEXT,
  "sourceGradeLevelId" TEXT NOT NULL,
  "targetGradeLevelId" TEXT,
  "targetPathwayId" TEXT,
  "outcome" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "reason" TEXT,
  "decidedBy" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionDecision_outcome_check" CHECK ("outcome" IN ('promoted','retained','graduated','transferred','withdrawn','deferred')),
  CONSTRAINT "PromotionDecision_status_check" CHECK ("status" IN ('draft','confirmed','applied')),
  CONSTRAINT "PromotionDecision_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_source_year_fkey" FOREIGN KEY ("sourceAcademicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_target_year_fkey" FOREIGN KEY ("targetAcademicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_source_grade_fkey" FOREIGN KEY ("sourceGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_target_grade_fkey" FOREIGN KEY ("targetGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_target_pathway_fkey" FOREIGN KEY ("targetPathwayId","schoolId") REFERENCES "AcademicPathway"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PromotionDecision_decidedBy_fkey" FOREIGN KEY ("decidedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PromotionDecision_id_schoolId_key" ON "PromotionDecision"("id","schoolId");
CREATE UNIQUE INDEX "PromotionDecision_student_source_year_key" ON "PromotionDecision"("schoolId","studentId","sourceAcademicYearId");
CREATE INDEX "PromotionDecision_school_source_year_status_idx" ON "PromotionDecision"("schoolId","sourceAcademicYearId","status");

CREATE TABLE "AcademicYearRollover" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sourceAcademicYearId" TEXT NOT NULL,
  "targetAcademicYearId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "validatedBy" TEXT,
  "validatedAt" TIMESTAMP(3),
  "committedBy" TEXT,
  "committedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicYearRollover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYearRollover_status_check" CHECK ("status" IN ('draft','validated','committed','cancelled')),
  CONSTRAINT "AcademicYearRollover_version_check" CHECK ("version" > 0),
  CONSTRAINT "AcademicYearRollover_distinct_years" CHECK ("sourceAcademicYearId" <> "targetAcademicYearId"),
  CONSTRAINT "AcademicYearRollover_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_source_year_fkey" FOREIGN KEY ("sourceAcademicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_target_year_fkey" FOREIGN KEY ("targetAcademicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_framework_fkey" FOREIGN KEY ("frameworkId","schoolId") REFERENCES "AcademicFramework"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_validatedBy_fkey" FOREIGN KEY ("validatedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRollover_committedBy_fkey" FOREIGN KEY ("committedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicYearRollover_id_schoolId_key" ON "AcademicYearRollover"("id","schoolId");
CREATE UNIQUE INDEX "AcademicYearRollover_one_open_run" ON "AcademicYearRollover"("schoolId","sourceAcademicYearId","targetAcademicYearId","frameworkId") WHERE "status" IN ('draft','validated');
CREATE INDEX "AcademicYearRollover_school_status_idx" ON "AcademicYearRollover"("schoolId","status","createdAt");

CREATE TABLE "AcademicYearRolloverItem" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "rolloverId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sourceYearEnrollmentId" TEXT NOT NULL,
  "decisionId" TEXT,
  "sourceGradeLevelId" TEXT NOT NULL,
  "targetGradeLevelId" TEXT,
  "targetPathwayId" TEXT,
  "targetClassSectionId" TEXT,
  "outcome" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "blockers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicYearRolloverItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYearRolloverItem_outcome_check" CHECK ("outcome" IN ('promoted','retained','graduated','transferred','withdrawn','deferred')),
  CONSTRAINT "AcademicYearRolloverItem_status_check" CHECK ("status" IN ('pending','ready','blocked','applied','skipped')),
  CONSTRAINT "AcademicYearRolloverItem_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_rollover_fkey" FOREIGN KEY ("rolloverId","schoolId") REFERENCES "AcademicYearRollover"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_source_enrollment_fkey" FOREIGN KEY ("sourceYearEnrollmentId","schoolId") REFERENCES "StudentYearEnrollment"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_decision_fkey" FOREIGN KEY ("decisionId","schoolId") REFERENCES "PromotionDecision"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_source_grade_fkey" FOREIGN KEY ("sourceGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_target_grade_fkey" FOREIGN KEY ("targetGradeLevelId","schoolId") REFERENCES "GradeLevel"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_target_pathway_fkey" FOREIGN KEY ("targetPathwayId","schoolId") REFERENCES "AcademicPathway"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearRolloverItem_target_section_fkey" FOREIGN KEY ("targetClassSectionId","schoolId") REFERENCES "ClassSection"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicYearRolloverItem_id_schoolId_key" ON "AcademicYearRolloverItem"("id","schoolId");
CREATE UNIQUE INDEX "AcademicYearRolloverItem_rollover_student_key" ON "AcademicYearRolloverItem"("rolloverId","studentId");
CREATE INDEX "AcademicYearRolloverItem_school_rollover_status_idx" ON "AcademicYearRolloverItem"("schoolId","rolloverId","status");

-- Cross-table semantic checks. Composite tenant FKs guarantee same-school rows;
-- these guards additionally ensure all grade/pathway rows belong to the same framework.
CREATE OR REPLACE FUNCTION sukuunova_guard_progression_framework()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE from_framework TEXT; to_framework TEXT; pathway_framework TEXT;
BEGIN
  SELECT "frameworkId" INTO from_framework FROM "GradeLevel" WHERE "id"=NEW."fromGradeLevelId" AND "schoolId"=NEW."schoolId";
  IF from_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Progression source grade belongs to another academic framework' USING ERRCODE='23514'; END IF;
  IF NEW."toGradeLevelId" IS NOT NULL THEN
    SELECT "frameworkId" INTO to_framework FROM "GradeLevel" WHERE "id"=NEW."toGradeLevelId" AND "schoolId"=NEW."schoolId";
    IF to_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Progression target grade belongs to another academic framework' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."targetPathwayId" IS NOT NULL THEN
    SELECT "frameworkId" INTO pathway_framework FROM "AcademicPathway" WHERE "id"=NEW."targetPathwayId" AND "schoolId"=NEW."schoolId";
    IF pathway_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Progression pathway belongs to another academic framework' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "GradeProgressionRule_framework_guard" BEFORE INSERT OR UPDATE ON "GradeProgressionRule" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_progression_framework();

CREATE OR REPLACE FUNCTION sukuunova_guard_section_framework()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE grade_framework TEXT; pathway_framework TEXT;
BEGIN
  SELECT "frameworkId" INTO grade_framework FROM "GradeLevel" WHERE "id"=NEW."gradeLevelId" AND "schoolId"=NEW."schoolId";
  IF NEW."pathwayId" IS NOT NULL THEN
    SELECT "frameworkId" INTO pathway_framework FROM "AcademicPathway" WHERE "id"=NEW."pathwayId" AND "schoolId"=NEW."schoolId";
    IF pathway_framework IS DISTINCT FROM grade_framework THEN RAISE EXCEPTION 'Class section pathway and grade belong to different academic frameworks' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "ClassSection_framework_guard" BEFORE INSERT OR UPDATE ON "ClassSection" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_section_framework();

CREATE OR REPLACE FUNCTION sukuunova_guard_year_enrollment_framework()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE grade_framework TEXT; pathway_framework TEXT;
BEGIN
  SELECT "frameworkId" INTO grade_framework FROM "GradeLevel" WHERE "id"=NEW."gradeLevelId" AND "schoolId"=NEW."schoolId";
  IF grade_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Year enrollment grade belongs to another academic framework' USING ERRCODE='23514'; END IF;
  IF NEW."pathwayId" IS NOT NULL THEN
    SELECT "frameworkId" INTO pathway_framework FROM "AcademicPathway" WHERE "id"=NEW."pathwayId" AND "schoolId"=NEW."schoolId";
    IF pathway_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Year enrollment pathway belongs to another academic framework' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StudentYearEnrollment_framework_guard" BEFORE INSERT OR UPDATE ON "StudentYearEnrollment" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_year_enrollment_framework();

CREATE OR REPLACE FUNCTION sukuunova_guard_promotion_framework()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE source_framework TEXT; target_framework TEXT; pathway_framework TEXT;
BEGIN
  SELECT "frameworkId" INTO source_framework FROM "GradeLevel" WHERE "id"=NEW."sourceGradeLevelId" AND "schoolId"=NEW."schoolId";
  IF source_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Promotion source grade belongs to another academic framework' USING ERRCODE='23514'; END IF;
  IF NEW."targetGradeLevelId" IS NOT NULL THEN
    SELECT "frameworkId" INTO target_framework FROM "GradeLevel" WHERE "id"=NEW."targetGradeLevelId" AND "schoolId"=NEW."schoolId";
    IF target_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Promotion target grade belongs to another academic framework' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."targetPathwayId" IS NOT NULL THEN
    SELECT "frameworkId" INTO pathway_framework FROM "AcademicPathway" WHERE "id"=NEW."targetPathwayId" AND "schoolId"=NEW."schoolId";
    IF pathway_framework IS DISTINCT FROM NEW."frameworkId" THEN RAISE EXCEPTION 'Promotion pathway belongs to another academic framework' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "PromotionDecision_framework_guard" BEFORE INSERT OR UPDATE ON "PromotionDecision" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_promotion_framework();

-- Compatibility bridge: legacy/new term Enrollment writers remain authoritative.
-- Once a Class has been mapped to an annual ClassSection, ready/confirmed term
-- enrolment establishes the matching year-level enrollment automatically. We
-- refuse silent cross-grade rewrites for an already established school year.
CREATE OR REPLACE FUNCTION sukuunova_sync_term_enrollment_to_year_structure()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE section_row RECORD; existing_row RECORD; mapped_status TEXT;
BEGIN
  SELECT cs."gradeLevelId", cs."pathwayId", gl."frameworkId"
    INTO section_row
    FROM "ClassSection" cs
    JOIN "GradeLevel" gl ON gl."id"=cs."gradeLevelId" AND gl."schoolId"=cs."schoolId"
   WHERE cs."schoolId"=NEW."schoolId" AND cs."academicYearId"=NEW."academicYearId"
     AND cs."classId"=NEW."classId" AND cs."isActive"=true
   LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO existing_row FROM "StudentYearEnrollment"
   WHERE "schoolId"=NEW."schoolId" AND "studentId"=NEW."studentId" AND "academicYearId"=NEW."academicYearId"
   LIMIT 1;
  IF FOUND AND (existing_row."frameworkId" IS DISTINCT FROM section_row."frameworkId" OR existing_row."gradeLevelId" IS DISTINCT FROM section_row."gradeLevelId") THEN
    IF NEW."status" IN ('ready','confirmed') THEN
      RAISE EXCEPTION 'Term enrollment conflicts with the learner year-grade enrollment' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  mapped_status := CASE NEW."status" WHEN 'draft' THEN 'planned' WHEN 'withdrawn' THEN 'withdrawn' ELSE 'active' END;
  INSERT INTO "StudentYearEnrollment" ("id","schoolId","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId","status","source","startedAt","createdBy")
  VALUES ('sye_' || NEW."id", NEW."schoolId", NEW."studentId", NEW."academicYearId", section_row."frameworkId", section_row."gradeLevelId", section_row."pathwayId", mapped_status, 'term_enrollment', NEW."startDate", NEW."createdBy")
  ON CONFLICT ("schoolId","studentId","academicYearId") DO UPDATE SET
    "pathwayId" = EXCLUDED."pathwayId",
    "status" = CASE
      WHEN "StudentYearEnrollment"."status" IN ('completed','graduated','transferred') THEN "StudentYearEnrollment"."status"
      ELSE EXCLUDED."status"
    END,
    "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "Enrollment_sync_year_structure" ON "Enrollment";
CREATE TRIGGER "Enrollment_sync_year_structure"
AFTER INSERT OR UPDATE OF "classId","status","academicYearId" ON "Enrollment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_sync_term_enrollment_to_year_structure();

-- Tenant isolation for every new school-owned table.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AcademicFramework','GradeLevel','AcademicPathway','GradeProgressionRule','ClassSection',
    'StudentYearEnrollment','PromotionDecision','AcademicYearRollover','AcademicYearRolloverItem'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), '''')) WITH CHECK ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), ''''))',
      lower(table_name) || '_tenant', table_name
    );
  END LOOP;
END $$;
