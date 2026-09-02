-- Keep the derived canonical AttendanceRecord aligned with each event's period.
-- This replaces the earlier hard-coded DAILY lookup/insert in the trigger.
CREATE OR REPLACE FUNCTION sukuunova_attendance_record_from_event() RETURNS trigger AS $$
DECLARE
  v_class_id TEXT;
  v_source TEXT;
  v_status TEXT;
  v_period_id TEXT;
  v_existing "AttendanceRecord"%ROWTYPE;
BEGIN
  IF NEW."studentId" IS NULL THEN
    RETURN NEW;
  END IF;

  v_period_id := COALESCE(NULLIF(NEW."periodId", ''), 'DAILY');

  SELECT s."classId" INTO v_class_id
  FROM "Student" s
  WHERE s."id" = NEW."studentId" AND s."schoolId" = NEW."schoolId";

  IF NEW."type" = 'absent' THEN
    v_status := 'ABSENT';
  ELSIF NEW."type" = 'late' OR NEW."isLate" IS TRUE THEN
    v_status := 'LATE';
  ELSIF NEW."type" = 'in' THEN
    v_status := 'PRESENT';
  ELSE
    v_status := NULL;
  END IF;

  IF NEW."method" IN ('face','fingerprint','card','qr') THEN
    v_source := 'DEVICE';
  ELSIF NEW."method" = 'manual' THEN
    v_source := 'MANUAL';
  ELSE
    v_source := 'IMPORT';
  END IF;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_existing
  FROM "AttendanceRecord"
  WHERE "schoolId" = NEW."schoolId"
    AND "studentId" = NEW."studentId"
    AND "attendanceDate" = NEW."attendanceDate"
    AND "periodId" = v_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO "AttendanceRecord"(
      "id","schoolId","studentId","classId","attendanceDate","periodId","status","source","recordedBy","recordedAt","deviceId","reason","eventIds"
    ) VALUES (
      'att-' || md5(NEW."id" || clock_timestamp()::text),
      NEW."schoolId", NEW."studentId", v_class_id, NEW."attendanceDate", v_period_id,
      v_status, v_source, NEW."recordedBy", NEW."timestamp", NEW."deviceId", NULL,
      jsonb_build_array(NEW."id")
    );
  ELSE
    IF v_existing.status = 'PENDING_REVIEW' THEN
      UPDATE "AttendanceRecord"
      SET "eventIds" = COALESCE("eventIds", '[]'::jsonb) || jsonb_build_array(NEW."id"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = v_existing."id";
    ELSIF v_existing.status = 'ABSENT' AND v_status IN ('PRESENT','LATE') THEN
      UPDATE "AttendanceRecord"
      SET "status" = 'PENDING_REVIEW',
          "reason" = 'Conflicting attendance events from multiple sources.',
          "eventIds" = COALESCE("eventIds", '[]'::jsonb) || jsonb_build_array(NEW."id"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = v_existing."id";
    ELSIF v_existing.status = 'PRESENT' AND v_status = 'LATE' THEN
      UPDATE "AttendanceRecord"
      SET "status" = 'LATE',
          "source" = CASE WHEN v_existing.source = 'DEVICE' OR v_source = 'DEVICE' THEN 'DEVICE' ELSE v_source END,
          "eventIds" = COALESCE("eventIds", '[]'::jsonb) || jsonb_build_array(NEW."id"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = v_existing."id";
    ELSE
      UPDATE "AttendanceRecord"
      SET "eventIds" = COALESCE("eventIds", '[]'::jsonb) || jsonb_build_array(NEW."id"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = v_existing."id";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AttendanceEvent_resolution_trigger" ON "AttendanceEvent";
CREATE TRIGGER "AttendanceEvent_resolution_trigger"
AFTER INSERT ON "AttendanceEvent"
FOR EACH ROW EXECUTE FUNCTION sukuunova_attendance_record_from_event();

-- Enforce exactly one owner for device identity and biometric records.
ALTER TABLE "DeviceIdentity"
  ADD CONSTRAINT "DeviceIdentity_exactly_one_owner_check"
  CHECK (("studentId" IS NOT NULL AND "staffId" IS NULL) OR ("studentId" IS NULL AND "staffId" IS NOT NULL))
  NOT VALID;

ALTER TABLE "FaceEnrollment"
  ADD CONSTRAINT "FaceEnrollment_exactly_one_owner_check"
  CHECK (("studentId" IS NOT NULL AND "staffId" IS NULL) OR ("studentId" IS NULL AND "staffId" IS NOT NULL))
  NOT VALID;

ALTER TABLE "FaceMatchReview"
  ADD CONSTRAINT "FaceMatchReview_exactly_one_candidate_check"
  CHECK (("candidateStudentId" IS NOT NULL AND "candidateStaffId" IS NULL) OR ("candidateStudentId" IS NULL AND "candidateStaffId" IS NOT NULL))
  NOT VALID;
