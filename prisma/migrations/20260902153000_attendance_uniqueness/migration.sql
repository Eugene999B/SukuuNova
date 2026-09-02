-- Prevent duplicate daily attendance events for the same person and direction.
-- Partial indexes preserve separate in/out events while making each transition unique.
CREATE UNIQUE INDEX "AttendanceEvent_student_daily_type_key"
  ON "AttendanceEvent" ("schoolId", "studentId", "attendanceDate", "type")
  WHERE "studentId" IS NOT NULL;

CREATE UNIQUE INDEX "AttendanceEvent_staff_daily_type_key"
  ON "AttendanceEvent" ("schoolId", "staffId", "attendanceDate", "type")
  WHERE "staffId" IS NOT NULL;
