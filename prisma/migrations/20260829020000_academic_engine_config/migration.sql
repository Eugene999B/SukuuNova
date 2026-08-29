ALTER TABLE "SchoolSettings"
  ADD COLUMN IF NOT EXISTS "timetableConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "assessmentConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "reportCardConfig" JSONB;

UPDATE "SchoolSettings"
SET
  "timetableConfig" = COALESCE("timetableConfig", '{"days":[{"dayOfWeek":1,"name":"Monday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":2,"name":"Tuesday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":3,"name":"Wednesday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":4,"name":"Thursday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":5,"name":"Friday","enabled":true,"start":"08:00","end":"14:00"}],"periodMinutes":40,"breaks":[{"name":"Break","start":"10:00","end":"10:20"},{"name":"Lunch","start":"12:20","end":"13:00"}],"periodsPerDay":8,"published":false}'::jsonb),
  "assessmentConfig" = COALESCE("assessmentConfig", '{"categories":[{"name":"Classwork","weight":20},{"name":"Homework","weight":10},{"name":"Exercises","weight":10},{"name":"Quizzes","weight":10},{"name":"Project","weight":10},{"name":"Exam","weight":40}],"rounding":"nearest","missingScorePolicy":"blank","allowTeacherOverride":false}'::jsonb),
  "reportCardConfig" = COALESCE("reportCardConfig", '{"includePosition":true,"includeSubjectPosition":true,"includeAttendance":true,"includeTeacherRemark":true,"includeHeadRemark":true,"includeSignatures":true,"includeSchoolContacts":true,"rankMethod":"total_average","showGrades":true,"showClassAverage":true}'::jsonb)
WHERE true;
