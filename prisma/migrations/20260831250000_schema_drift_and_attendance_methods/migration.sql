ALTER TABLE "AcademicYear"
  ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Guardian"
  ADD COLUMN IF NOT EXISTS "email" TEXT;

ALTER TABLE "AttendanceEvent"
  ADD COLUMN IF NOT EXISTS "confidenceScore" DECIMAL(65,30);
ALTER TABLE "AttendanceEvent"
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

ALTER TABLE "AttendanceEvent"
  DROP CONSTRAINT IF EXISTS "AttendanceEvent_method_check";
ALTER TABLE "AttendanceEvent"
  ADD CONSTRAINT "AttendanceEvent_method_check"
  CHECK ("method" IN ('manual','qr','face','fingerprint','card'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceEvent_device_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Device'
  ) THEN
    ALTER TABLE "AttendanceEvent"
      ADD CONSTRAINT "AttendanceEvent_device_fkey"
      FOREIGN KEY ("deviceId", "schoolId") REFERENCES "Device"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AttendanceEvent_school_device_idx"
  ON "AttendanceEvent"("schoolId","deviceId","attendanceDate");

CREATE INDEX IF NOT EXISTS "AcademicYear_school_locked_idx"
  ON "AcademicYear"("schoolId","isLocked");
