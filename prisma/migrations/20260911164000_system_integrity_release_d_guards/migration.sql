-- Release D integrity guards: deterministic guardian identity and timetable collision boundaries.

-- Existing data may contain more than one primary guardian because the original schema did
-- not enforce the intent. Keep one deterministic primary, preferring a linked active/pending
-- portal guardian, and demote the rest without deleting any family relationship.
WITH ranked_primary AS (
  SELECT
    sg."schoolId",
    sg."studentId",
    sg."guardianId",
    ROW_NUMBER() OVER (
      PARTITION BY sg."schoolId", sg."studentId"
      ORDER BY
        CASE WHEN u."status" IN ('active','pending') THEN 0
             WHEN g."userId" IS NOT NULL THEN 1
             ELSE 2 END,
        sg."guardianId"
    ) AS rn
  FROM "StudentGuardian" sg
  JOIN "Guardian" g
    ON g."id" = sg."guardianId" AND g."schoolId" = sg."schoolId"
  LEFT JOIN "User" u
    ON u."id" = g."userId" AND u."schoolId" = g."schoolId"
  WHERE sg."isPrimary" = true
)
UPDATE "StudentGuardian" sg
SET "isPrimary" = false
FROM ranked_primary r
WHERE r.rn > 1
  AND sg."schoolId" = r."schoolId"
  AND sg."studentId" = r."studentId"
  AND sg."guardianId" = r."guardianId";

CREATE UNIQUE INDEX IF NOT EXISTS "StudentGuardian_one_primary_per_student_key"
  ON "StudentGuardian"("schoolId","studentId")
  WHERE "isPrimary" = true;

-- One portal User must not acquire multiple Guardian personas. Existing ambiguous data is
-- left intact for explicit school-office repair, but every new/changed link is fail-closed.
CREATE OR REPLACE FUNCTION sukuunova_guard_guardian_user_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."userId" IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "Guardian" g
    WHERE g."schoolId" = NEW."schoolId"
      AND g."userId" = NEW."userId"
      AND g."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'A guardian portal user can own only one guardian profile in a school'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Guardian_unique_user_profile_guard" ON "Guardian";
CREATE TRIGGER "Guardian_unique_user_profile_guard"
BEFORE INSERT OR UPDATE OF "schoolId","userId" ON "Guardian"
FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_guardian_user_identity();

-- Timetable services already reject clashes. This database guard extends the same invariant
-- to fixtures, imports, legacy endpoints and future direct writers.
CREATE OR REPLACE FUNCTION sukuunova_guard_timetable_collision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_venue TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TimetableSlot" t
    WHERE t."schoolId" = NEW."schoolId"
      AND t."teacherId" = NEW."teacherId"
      AND t."dayOfWeek" = NEW."dayOfWeek"
      AND t."period" = NEW."period"
      AND t."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'Teacher is already assigned to another class in this day/period'
      USING ERRCODE = '23505';
  END IF;

  normalized_venue := NULLIF(LOWER(BTRIM(COALESCE(NEW."venue", ''))), '');
  IF normalized_venue IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "TimetableSlot" t
    WHERE t."schoolId" = NEW."schoolId"
      AND t."dayOfWeek" = NEW."dayOfWeek"
      AND t."period" = NEW."period"
      AND NULLIF(LOWER(BTRIM(COALESCE(t."venue", ''))), '') = normalized_venue
      AND t."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'Venue is already assigned to another class in this day/period'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TimetableSlot_collision_guard" ON "TimetableSlot";
CREATE TRIGGER "TimetableSlot_collision_guard"
BEFORE INSERT OR UPDATE OF "schoolId","teacherId","dayOfWeek","period","venue" ON "TimetableSlot"
FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_timetable_collision();
