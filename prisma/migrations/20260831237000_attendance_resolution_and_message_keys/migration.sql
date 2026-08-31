CREATE OR REPLACE FUNCTION sukuunova_message_idempotency_key() RETURNS trigger AS $$
BEGIN
  IF NEW."idempotencyKey" IS NULL OR NEW."idempotencyKey" = '' THEN
    NEW."idempotencyKey" := COALESCE(NEW."templateKey", 'manual') || ':' ||
      NEW."recipientType" || ':' || NEW."recipientId" || ':' || NEW."channel" || ':' ||
      md5(COALESCE(NEW."body", '') || '|' || COALESCE(NEW."templateVariables"::text, ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Message_idempotency_key_trigger" ON "Message";
CREATE TRIGGER "Message_idempotency_key_trigger"
BEFORE INSERT ON "Message"
FOR EACH ROW EXECUTE FUNCTION sukuunova_message_idempotency_key();

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classId" TEXT,
  "attendanceDate" DATE NOT NULL,
  "periodId" TEXT NOT NULL DEFAULT 'DAILY',
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "recordedBy" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deviceId" TEXT,
  "reason" TEXT,
  "eventIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_school_student_date_period_key"
  ON "AttendanceRecord"("schoolId","studentId","attendanceDate","periodId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_school_status_idx"
  ON "AttendanceRecord"("schoolId","status","attendanceDate");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_school_student_idx"
  ON "AttendanceRecord"("schoolId","studentId","attendanceDate");

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_student_school_fkey"
  FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_class_school_fkey"
  FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_recorder_school_fkey"
  FOREIGN KEY ("recordedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_device_school_fkey"
  FOREIGN KEY ("deviceId","schoolId") REFERENCES "Device"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_resolver_school_fkey"
  FOREIGN KEY ("resolvedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AttendanceRecord_tenant_isolation" ON "AttendanceRecord";
CREATE POLICY "AttendanceRecord_tenant_isolation" ON "AttendanceRecord"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());

CREATE OR REPLACE FUNCTION sukuunova_attendance_record_from_event() RETURNS trigger AS $$
DECLARE
  v_class_id TEXT;
  v_source TEXT;
  v_status TEXT;
  v_existing "AttendanceRecord"%ROWTYPE;
BEGIN
  IF NEW."studentId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s."classId" INTO v_class_id
  FROM "Student" s
  WHERE s."id" = NEW."studentId" AND s."schoolId" = NEW."schoolId";

  IF NEW."type" = 'absent' THEN
    v_status := 'ABSENT';
  ELSIF NEW."type" = 'late' OR NEW."isLate" IS TRUE THEN
    v_status := 'LATE';
  ELSIF NEW."type" = 'in' THEN
    v_status := 'PRESENT';
  ELSIF NEW."type" = 'out' THEN
    v_status := NULL;
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
    AND "periodId" = 'DAILY'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO "AttendanceRecord"(
      "id","schoolId","studentId","classId","attendanceDate","periodId","status","source","recordedBy","recordedAt","deviceId","reason","eventIds"
    ) VALUES (
      'att-' || md5(NEW."id" || clock_timestamp()::text), NEW."schoolId", NEW."studentId", v_class_id,
      NEW."attendanceDate", 'DAILY', v_status, v_source, NEW."recordedBy", NEW."timestamp", NEW."deviceId", NULL,
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

CREATE OR REPLACE FUNCTION sukuunova_touch_attendance_record() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AttendanceRecord_touch_trigger" ON "AttendanceRecord";
CREATE TRIGGER "AttendanceRecord_touch_trigger"
BEFORE UPDATE ON "AttendanceRecord"
FOR EACH ROW EXECUTE FUNCTION sukuunova_touch_attendance_record();
