-- Backfill year-grade context when an existing annual class is mapped into the
-- Academic Structure Engine. This complements Enrollment_sync_year_structure,
-- which handles future term-enrolment writes.

CREATE OR REPLACE FUNCTION sukuunova_backfill_section_year_enrollments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  framework_id TEXT;
  conflict_count INTEGER;
BEGIN
  IF NEW."isActive" IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT "frameworkId" INTO framework_id
    FROM "GradeLevel"
   WHERE "schoolId"=NEW."schoolId" AND "id"=NEW."gradeLevelId";
  IF framework_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO conflict_count
    FROM "Enrollment" e
    JOIN "StudentYearEnrollment" sye
      ON sye."schoolId"=e."schoolId"
     AND sye."studentId"=e."studentId"
     AND sye."academicYearId"=e."academicYearId"
   WHERE e."schoolId"=NEW."schoolId"
     AND e."academicYearId"=NEW."academicYearId"
     AND e."classId"=NEW."classId"
     AND e."status" IN ('ready','confirmed')
     AND (sye."frameworkId" IS DISTINCT FROM framework_id OR sye."gradeLevelId" IS DISTINCT FROM NEW."gradeLevelId");
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Class section mapping conflicts with existing learner year-grade history' USING ERRCODE='23514';
  END IF;

  INSERT INTO "StudentYearEnrollment" (
    "id","schoolId","studentId","academicYearId","frameworkId","gradeLevelId","pathwayId",
    "status","source","startedAt","createdBy"
  )
  SELECT
    'sye_map_' || md5(NEW."id" || ':' || source."studentId"),
    NEW."schoolId",
    source."studentId",
    NEW."academicYearId",
    framework_id,
    NEW."gradeLevelId",
    NEW."pathwayId",
    'active',
    'term_enrollment',
    source."startedAt",
    source."createdBy"
  FROM (
    SELECT DISTINCT ON (e."studentId")
      e."studentId",
      COALESCE(e."startDate", e."enrollmentDate") AS "startedAt",
      e."createdBy"
    FROM "Enrollment" e
    WHERE e."schoolId"=NEW."schoolId"
      AND e."academicYearId"=NEW."academicYearId"
      AND e."classId"=NEW."classId"
      AND e."status" IN ('ready','confirmed')
    ORDER BY e."studentId", e."enrollmentDate" ASC, e."id" ASC
  ) source
  ON CONFLICT ("schoolId","studentId","academicYearId") DO UPDATE SET
    "pathwayId"=EXCLUDED."pathwayId",
    "updatedAt"=CURRENT_TIMESTAMP
  WHERE "StudentYearEnrollment"."frameworkId"=EXCLUDED."frameworkId"
    AND "StudentYearEnrollment"."gradeLevelId"=EXCLUDED."gradeLevelId";

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "ClassSection_backfill_year_enrollments" ON "ClassSection";
CREATE TRIGGER "ClassSection_backfill_year_enrollments"
AFTER INSERT OR UPDATE OF "academicYearId","gradeLevelId","classId","pathwayId","isActive" ON "ClassSection"
FOR EACH ROW EXECUTE FUNCTION sukuunova_backfill_section_year_enrollments();
