ALTER TABLE "AttendanceRecord"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SyncOperation"
  ADD COLUMN IF NOT EXISTS "baseEntityVersion" INTEGER;

CREATE INDEX IF NOT EXISTS "AttendanceRecord_school_student_version_idx"
  ON "AttendanceRecord"("schoolId","studentId","version");

CREATE OR REPLACE FUNCTION sukuunova_touch_attendance_record_version() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AttendanceRecord_touch_trigger" ON "AttendanceRecord";
CREATE TRIGGER "AttendanceRecord_touch_trigger"
BEFORE UPDATE ON "AttendanceRecord"
FOR EACH ROW EXECUTE FUNCTION sukuunova_touch_attendance_record_version();
