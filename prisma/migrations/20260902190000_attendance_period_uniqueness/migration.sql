-- Restore period-aware attendance uniqueness.
-- AttendanceRecord is intentionally period-scoped, so the event invariant must include periodId.
-- No time-bucket deduplication is used: exact database uniqueness remains authoritative.

CREATE OR REPLACE FUNCTION sukuunova_set_attendance_event_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."periodId" := COALESCE(NULLIF(current_setting('sukuunova.attendance_period', true), ''), NULLIF(NEW."periodId", ''), 'DAILY');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sukuunova_attendance_event_period_before_insert ON "AttendanceEvent";
CREATE TRIGGER sukuunova_attendance_event_period_before_insert
BEFORE INSERT ON "AttendanceEvent"
FOR EACH ROW
EXECUTE FUNCTION sukuunova_set_attendance_event_period();

DROP INDEX IF EXISTS "AttendanceEvent_student_daily_type_key";
DROP INDEX IF EXISTS "AttendanceEvent_staff_daily_type_key";

CREATE UNIQUE INDEX "AttendanceEvent_student_daily_period_type_key"
  ON "AttendanceEvent" ("schoolId", "studentId", "attendanceDate", "periodId", "type")
  WHERE "studentId" IS NOT NULL;

CREATE UNIQUE INDEX "AttendanceEvent_staff_daily_period_type_key"
  ON "AttendanceEvent" ("schoolId", "staffId", "attendanceDate", "periodId", "type")
  WHERE "staffId" IS NOT NULL;
