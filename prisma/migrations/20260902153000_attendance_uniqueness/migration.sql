-- Normalize historical attendance before enforcing the one-event-per-person/day/type invariant.
-- The application now rejects duplicate transitions, but older records can legitimately contain them.
-- Keep the earliest recorded event for each tenant/person/day/direction and remove later duplicates.
WITH ranked_student AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "schoolId", "studentId", "attendanceDate", type
           ORDER BY "timestamp" ASC, id ASC
         ) AS rn
  FROM "AttendanceEvent"
  WHERE "studentId" IS NOT NULL
)
DELETE FROM "AttendanceEvent" a
USING ranked_student r
WHERE a.id = r.id
  AND r.rn > 1;

WITH ranked_staff AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "schoolId", "staffId", "attendanceDate", type
           ORDER BY "timestamp" ASC, id ASC
         ) AS rn
  FROM "AttendanceEvent"
  WHERE "staffId" IS NOT NULL
)
DELETE FROM "AttendanceEvent" a
USING ranked_staff r
WHERE a.id = r.id
  AND r.rn > 1;

-- Prevent duplicate daily attendance events for the same person and direction.
-- Partial indexes preserve separate in/out events while making each transition unique.
CREATE UNIQUE INDEX "AttendanceEvent_student_daily_type_key"
  ON "AttendanceEvent" ("schoolId", "studentId", "attendanceDate", "type")
  WHERE "studentId" IS NOT NULL;

CREATE UNIQUE INDEX "AttendanceEvent_staff_daily_type_key"
  ON "AttendanceEvent" ("schoolId", "staffId", "attendanceDate", "type")
  WHERE "staffId" IS NOT NULL;
