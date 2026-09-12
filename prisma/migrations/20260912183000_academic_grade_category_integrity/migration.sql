-- Academic grading integrity repair.
-- TeacherAcademicWork previously projected most work kinds into Assessment.type='ca',
-- which made Homework / Exercise / Quiz / Project behave like Classwork. Preserve
-- historical scores while restoring the category identity of already-linked work.
WITH canonical AS (
  SELECT
    w."schoolId",
    w."assessmentId",
    CASE lower(trim(w."kind"))
      WHEN 'classwork' THEN 'classwork'
      WHEN 'homework' THEN 'homework'
      WHEN 'exercise' THEN 'exercises'
      WHEN 'exercises' THEN 'exercises'
      WHEN 'quiz' THEN 'quizzes'
      WHEN 'quizzes' THEN 'quizzes'
      WHEN 'project' THEN 'project'
      WHEN 'exam' THEN 'exam'
      WHEN 'examination' THEN 'exam'
      WHEN 'participation' THEN 'participation'
      ELSE NULL
    END AS "canonicalType"
  FROM "TeacherAcademicWork" w
  WHERE w."assessmentId" IS NOT NULL
)
UPDATE "Assessment" a
SET "type" = canonical."canonicalType"
FROM canonical
WHERE canonical."assessmentId" = a."id"
  AND canonical."schoolId" = a."schoolId"
  AND canonical."canonicalType" IS NOT NULL
  AND a."type" IS DISTINCT FROM canonical."canonicalType";
