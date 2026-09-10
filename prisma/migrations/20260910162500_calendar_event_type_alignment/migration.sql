-- Keep the database contract aligned with the calendar service and Events workspace.
-- Existing installations originally accepted only holiday/vacation/exam_week/closure,
-- while the current product also supports richer school event categories.
ALTER TABLE "CalendarEvent"
  DROP CONSTRAINT IF EXISTS "CalendarEvent_type_check";

ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT "CalendarEvent_type_check"
  CHECK ("type" IN (
    'holiday',
    'vacation',
    'exam_week',
    'closure',
    'academic',
    'parent',
    'operational',
    'sports',
    'trip',
    'meeting',
    'other'
  ));
