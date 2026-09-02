-- Speed up tenant-scoped daily attendance queries that filter by event type.
CREATE INDEX IF NOT EXISTS "AttendanceEvent_school_date_type_idx"
ON "AttendanceEvent" ("schoolId", "attendanceDate", "type");
