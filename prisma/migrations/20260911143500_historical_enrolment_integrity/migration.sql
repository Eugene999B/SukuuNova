-- Release B: make Enrollment a trustworthy historical student+term+class fact.

ALTER TABLE "Enrollment"
  DROP CONSTRAINT IF EXISTS "Enrollment_status_check";
ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_status_check"
  CHECK ("status" IN ('draft','ready','confirmed','withdrawn'));

-- `continuing` exists in older trial/import data and is semantically equivalent to a returning learner.
ALTER TABLE "Enrollment"
  DROP CONSTRAINT IF EXISTS "Enrollment_entry_type_check";
ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_entry_type_check"
  CHECK ("entryType" IN ('new','returning','transfer','continuing'));

CREATE OR REPLACE FUNCTION sukuunova_enforce_enrollment_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  term_year TEXT;
BEGIN
  SELECT t."academicYearId" INTO term_year
    FROM "Term" t
   WHERE t."id" = NEW."termId"
     AND t."schoolId" = NEW."schoolId";

  IF term_year IS NULL THEN
    RAISE EXCEPTION 'Enrollment term % does not belong to school %', NEW."termId", NEW."schoolId"
      USING ERRCODE = '23514';
  END IF;

  IF term_year <> NEW."academicYearId" THEN
    RAISE EXCEPTION 'Enrollment academic year does not match its term'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'withdrawn' AND NEW."status" <> 'withdrawn' THEN
      RAISE EXCEPTION 'A withdrawn enrollment is historical and cannot be reopened'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."status" = 'confirmed' THEN
      IF NEW."status" NOT IN ('confirmed','withdrawn') THEN
        RAISE EXCEPTION 'A confirmed enrollment cannot be downgraded to draft or ready'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."classId" IS DISTINCT FROM OLD."classId"
         OR NEW."termId" IS DISTINCT FROM OLD."termId"
         OR NEW."academicYearId" IS DISTINCT FROM OLD."academicYearId"
         OR NEW."studentId" IS DISTINCT FROM OLD."studentId" THEN
        RAISE EXCEPTION 'Confirmed enrollment academic context is immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Enrollment_historical_context_guard" ON "Enrollment";
CREATE TRIGGER "Enrollment_historical_context_guard"
BEFORE INSERT OR UPDATE OF "studentId","academicYearId","termId","classId","status"
ON "Enrollment"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_enforce_enrollment_context();

CREATE INDEX IF NOT EXISTS "Enrollment_schoolId_termId_classId_status_idx"
  ON "Enrollment"("schoolId","termId","classId","status");
