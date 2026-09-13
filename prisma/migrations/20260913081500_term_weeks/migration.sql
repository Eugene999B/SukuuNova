-- Academic Workflow Reset: make teaching weeks first-class, tenant-scoped records.
-- Existing Term.teachingWeeks remains as the compatibility count while all
-- operational week/date validation moves to these durable ranges.
CREATE TABLE "TermWeek" (
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "isTeaching" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "TermWeek_pkey" PRIMARY KEY ("termId", "weekNumber"),
  CONSTRAINT "TermWeek_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TermWeek_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "Term"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TermWeek_weekNumber_check" CHECK ("weekNumber" >= 1 AND "weekNumber" <= 30),
  CONSTRAINT "TermWeek_dateRange_check" CHECK ("endDate" >= "startDate")
);

CREATE INDEX "TermWeek_schoolId_idx" ON "TermWeek"("schoolId");
CREATE INDEX "TermWeek_schoolId_termId_idx" ON "TermWeek"("schoolId", "termId");
CREATE INDEX "TermWeek_schoolId_startDate_endDate_idx" ON "TermWeek"("schoolId", "startDate", "endDate");

-- Backfill historical terms without inventing dates outside the term. If an old
-- fixture/config says it has more teaching weeks than can physically start in
-- the term, materialize only the possible ranges; current write paths reject
-- that invalid combination going forward instead of silently preserving it.
WITH normalized AS (
  SELECT
    t."schoolId",
    t."id" AS "termId",
    t."startDate",
    t."endDate",
    GREATEST(
      1,
      LEAST(
        30,
        COALESCE(t."teachingWeeks", 13),
        FLOOR(EXTRACT(EPOCH FROM (t."endDate" - t."startDate")) / 604800)::int + 1
      )
    ) AS "effectiveWeeks"
  FROM "Term" t
  WHERE t."endDate" >= t."startDate"
), generated AS (
  SELECT n.*, gs AS "weekNumber"
  FROM normalized n
  CROSS JOIN LATERAL generate_series(1, n."effectiveWeeks") AS gs
)
INSERT INTO "TermWeek" ("schoolId", "termId", "weekNumber", "startDate", "endDate", "isTeaching")
SELECT
  g."schoolId",
  g."termId",
  g."weekNumber",
  g."startDate" + ((g."weekNumber" - 1) * INTERVAL '7 days'),
  CASE
    WHEN g."weekNumber" = g."effectiveWeeks" THEN g."endDate"
    ELSE LEAST(g."endDate", g."startDate" + (((g."weekNumber" * 7) - 1) * INTERVAL '1 day'))
  END,
  TRUE
FROM generated g
ON CONFLICT ("termId", "weekNumber") DO NOTHING;

ALTER TABLE "TermWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TermWeek" FORCE ROW LEVEL SECURITY;
CREATE POLICY "term_week_tenant" ON "TermWeek"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
