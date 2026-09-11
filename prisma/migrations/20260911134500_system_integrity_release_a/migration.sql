-- SukuuNova Release A: identity, safety and academic-calendar integrity.
-- These checks protect canonical boundaries even when a legacy/direct writer bypasses UI services.

-- 1) Unknown faces must be representable for human review. The older constraint already
-- prevents both candidate columns from being populated; this later constraint accidentally
-- required exactly one candidate and rejected the safest no-match state.
ALTER TABLE "FaceMatchReview"
  DROP CONSTRAINT IF EXISTS "FaceMatchReview_exactly_one_candidate_check";

ALTER TABLE "FaceMatchReview"
  DROP CONSTRAINT IF EXISTS "FaceMatchReview_at_most_one_candidate_check";

ALTER TABLE "FaceMatchReview"
  ADD CONSTRAINT "FaceMatchReview_at_most_one_candidate_check"
  CHECK (NOT ("candidateStudentId" IS NOT NULL AND "candidateStaffId" IS NOT NULL));

-- 2) Canonical account-kind predicates for database-level staff/teacher foreign-key guards.
CREATE OR REPLACE FUNCTION sukuunova_active_staff(p_school_id TEXT, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "User" u
    WHERE u."id" = p_user_id
      AND u."schoolId" = p_school_id
      AND u."status" = 'active'
      AND EXISTS (
        SELECT 1
        FROM "UserRole" ur
        JOIN "Role" r
          ON r."id" = ur."roleId"
         AND r."schoolId" = ur."schoolId"
        WHERE ur."userId" = u."id"
          AND ur."schoolId" = u."schoolId"
          AND COALESCE(NULLIF(BTRIM(r."key"), ''), LOWER(REGEXP_REPLACE(BTRIM(r."name"), '[^a-zA-Z0-9]+', '_', 'g')))
              NOT IN ('parent', 'guardian', 'student')
      )
  );
$$;

CREATE OR REPLACE FUNCTION sukuunova_active_teacher(p_school_id TEXT, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "User" u
    WHERE u."id" = p_user_id
      AND u."schoolId" = p_school_id
      AND u."status" = 'active'
      AND EXISTS (
        SELECT 1
        FROM "UserRole" ur
        JOIN "Role" r
          ON r."id" = ur."roleId"
         AND r."schoolId" = ur."schoolId"
        WHERE ur."userId" = u."id"
          AND ur."schoolId" = u."schoolId"
          AND COALESCE(NULLIF(BTRIM(r."key"), ''), LOWER(REGEXP_REPLACE(BTRIM(r."name"), '[^a-zA-Z0-9]+', '_', 'g')))
              IN ('teacher', 'class_teacher', 'subject_teacher', 'academic_coordinator', 'department_head')
      )
  );
$$;

CREATE OR REPLACE FUNCTION sukuunova_enforce_staff_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_id TEXT;
  school_id TEXT;
BEGIN
  target_id := to_jsonb(NEW) ->> TG_ARGV[0];
  school_id := to_jsonb(NEW) ->> 'schoolId';
  IF target_id IS NOT NULL AND NOT sukuunova_active_staff(school_id, target_id) THEN
    RAISE EXCEPTION 'Invalid staff reference in %.%: % is not an active staff account in school %', TG_TABLE_NAME, TG_ARGV[0], target_id, school_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sukuunova_enforce_teacher_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_id TEXT;
  school_id TEXT;
BEGIN
  target_id := to_jsonb(NEW) ->> TG_ARGV[0];
  school_id := to_jsonb(NEW) ->> 'schoolId';
  IF target_id IS NOT NULL AND NOT sukuunova_active_teacher(school_id, target_id) THEN
    RAISE EXCEPTION 'Invalid teaching reference in %.%: % is not an active teaching account in school %', TG_TABLE_NAME, TG_ARGV[0], target_id, school_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Staff-only foreign keys.
DROP TRIGGER IF EXISTS "SalaryStructure_staff_boundary" ON "SalaryStructure";
CREATE TRIGGER "SalaryStructure_staff_boundary"
BEFORE INSERT OR UPDATE OF "staffId", "schoolId" ON "SalaryStructure"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('staffId');

DROP TRIGGER IF EXISTS "DeviceIdentity_staff_boundary" ON "DeviceIdentity";
CREATE TRIGGER "DeviceIdentity_staff_boundary"
BEFORE INSERT OR UPDATE OF "staffId", "schoolId" ON "DeviceIdentity"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('staffId');

DROP TRIGGER IF EXISTS "VisitorLog_host_boundary" ON "VisitorLog";
CREATE TRIGGER "VisitorLog_host_boundary"
BEFORE INSERT OR UPDATE OF "hostStaffId", "schoolId" ON "VisitorLog"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('hostStaffId');

DROP TRIGGER IF EXISTS "SchoolPropertyHolding_custodian_boundary" ON "SchoolPropertyHolding";
CREATE TRIGGER "SchoolPropertyHolding_custodian_boundary"
BEFORE INSERT OR UPDATE OF "custodianUserId", "schoolId" ON "SchoolPropertyHolding"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('custodianUserId');

DROP TRIGGER IF EXISTS "FaceEnrollment_staff_boundary" ON "FaceEnrollment";
CREATE TRIGGER "FaceEnrollment_staff_boundary"
BEFORE INSERT OR UPDATE OF "staffId", "schoolId" ON "FaceEnrollment"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('staffId');

DROP TRIGGER IF EXISTS "FaceMatchReview_staff_boundary" ON "FaceMatchReview";
CREATE TRIGGER "FaceMatchReview_staff_boundary"
BEFORE INSERT OR UPDATE OF "candidateStaffId", "schoolId" ON "FaceMatchReview"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('candidateStaffId');

-- Subject-teaching assignment is strict: only explicitly teaching/academic accounts qualify.
DROP TRIGGER IF EXISTS "ClassSubjectTeacher_teacher_boundary" ON "ClassSubjectTeacher";
CREATE TRIGGER "ClassSubjectTeacher_teacher_boundary"
BEFORE INSERT OR UPDATE OF "teacherId", "schoolId" ON "ClassSubjectTeacher"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_teacher_reference('teacherId');

-- Legacy fixtures and some schools legitimately let leadership cover a class/slot without a
-- separate Teacher role. These two edges therefore enforce staff (never family) at DB level;
-- NovaCore/service writers remain responsible for the stronger teaching-role rule.
DROP TRIGGER IF EXISTS "Class_class_teacher_boundary" ON "Class";
CREATE TRIGGER "Class_class_teacher_boundary"
BEFORE INSERT OR UPDATE OF "classTeacherId", "schoolId" ON "Class"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('classTeacherId');

DROP TRIGGER IF EXISTS "TimetableSlot_teacher_boundary" ON "TimetableSlot";
CREATE TRIGGER "TimetableSlot_teacher_boundary"
BEFORE INSERT OR UPDATE OF "teacherId", "schoolId" ON "TimetableSlot"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_staff_reference('teacherId');

-- 3) Attendance target validity must be checked regardless of manual/face/device writer.
CREATE OR REPLACE FUNCTION sukuunova_enforce_attendance_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."studentId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."id" = NEW."studentId"
        AND s."schoolId" = NEW."schoolId"
        AND s."status" = 'active'
    ) THEN
      RAISE EXCEPTION 'Attendance target student % is not active in school %', NEW."studentId", NEW."schoolId"
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."staffId" IS NOT NULL THEN
    IF NOT sukuunova_active_staff(NEW."schoolId", NEW."staffId") THEN
      RAISE EXCEPTION 'Attendance target staff % is not active staff in school %', NEW."staffId", NEW."schoolId"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AttendanceEvent_active_target" ON "AttendanceEvent";
CREATE TRIGGER "AttendanceEvent_active_target"
BEFORE INSERT OR UPDATE OF "studentId", "staffId", "schoolId" ON "AttendanceEvent"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_attendance_target();

-- 4) Academic year and term ranges are inclusive throughout SukuuNova. Enforce the same
-- interpretation at the database boundary and serialize competing writers per school/year.
CREATE OR REPLACE FUNCTION sukuunova_enforce_academic_year_range()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."endDate" < NEW."startDate" THEN
    RAISE EXCEPTION 'Academic year end date must be on or after start date' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('academic-years:' || NEW."schoolId"));
  IF EXISTS (
    SELECT 1 FROM "AcademicYear" ay
    WHERE ay."schoolId" = NEW."schoolId"
      AND ay."id" <> NEW."id"
      AND ay."startDate" <= NEW."endDate"
      AND ay."endDate" >= NEW."startDate"
  ) THEN
    RAISE EXCEPTION 'Academic year overlaps another academic year in school %', NEW."schoolId" USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AcademicYear_no_overlap" ON "AcademicYear";
CREATE TRIGGER "AcademicYear_no_overlap"
BEFORE INSERT OR UPDATE OF "startDate", "endDate", "schoolId" ON "AcademicYear"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_academic_year_range();

CREATE OR REPLACE FUNCTION sukuunova_enforce_term_range()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  year_start TIMESTAMP(3);
  year_end TIMESTAMP(3);
BEGIN
  IF NEW."endDate" < NEW."startDate" THEN
    RAISE EXCEPTION 'Term end date must be on or after start date' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('academic-year-terms:' || NEW."schoolId" || ':' || NEW."academicYearId"));
  SELECT ay."startDate", ay."endDate" INTO year_start, year_end
    FROM "AcademicYear" ay
    WHERE ay."id" = NEW."academicYearId" AND ay."schoolId" = NEW."schoolId";
  IF year_start IS NULL OR NEW."startDate" < year_start OR NEW."endDate" > year_end THEN
    RAISE EXCEPTION 'Term dates must fall inside the selected academic year' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Term" t
    WHERE t."schoolId" = NEW."schoolId"
      AND t."academicYearId" = NEW."academicYearId"
      AND t."id" <> NEW."id"
      AND t."startDate" <= NEW."endDate"
      AND t."endDate" >= NEW."startDate"
  ) THEN
    RAISE EXCEPTION 'Term overlaps another term in academic year %', NEW."academicYearId" USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Term_no_overlap" ON "Term";
CREATE TRIGGER "Term_no_overlap"
BEFORE INSERT OR UPDATE OF "startDate", "endDate", "academicYearId", "schoolId" ON "Term"
FOR EACH ROW EXECUTE FUNCTION sukuunova_enforce_term_range();
