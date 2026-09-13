-- Academic Calendar & Class Teacher Operations
-- Adds planning/session semantics around existing AcademicYear + Term records.
-- Existing Term, CalendarEvent, TermWeek and term-lock behavior remain canonical.

CREATE TABLE "AcademicYearPlan" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "patternKey" TEXT NOT NULL DEFAULT 'custom',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicYearPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYearPlan_pattern_check" CHECK ("patternKey" IN ('three_terms','two_semesters','three_trimesters','four_quarters','custom')),
  CONSTRAINT "AcademicYearPlan_status_check" CHECK ("status" IN ('draft','active','closed')),
  CONSTRAINT "AcademicYearPlan_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearPlan_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicYearPlan_createdBy_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicYearPlan_id_schoolId_key" ON "AcademicYearPlan"("id","schoolId");
CREATE UNIQUE INDEX "AcademicYearPlan_school_year_key" ON "AcademicYearPlan"("schoolId","academicYearId");
CREATE INDEX "AcademicYearPlan_school_status_idx" ON "AcademicYearPlan"("schoolId","status");

CREATE TABLE "AcademicSessionPolicy" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearPlanId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "sessionKind" TEXT NOT NULL DEFAULT 'term',
  "isYearEnd" BOOLEAN NOT NULL DEFAULT false,
  "closingStatus" TEXT NOT NULL DEFAULT 'open',
  "teacherMarksCloseAt" TIMESTAMP(3),
  "classTeacherReviewCloseAt" TIMESTAMP(3),
  "reportApprovalAt" TIMESTAMP(3),
  "reportReleaseAt" TIMESTAMP(3),
  "lockTargetAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicSessionPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicSessionPolicy_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "AcademicSessionPolicy_kind_check" CHECK ("sessionKind" IN ('term','semester','trimester','quarter','custom')),
  CONSTRAINT "AcademicSessionPolicy_closing_check" CHECK ("closingStatus" IN ('open','closing','ready','locked')),
  CONSTRAINT "AcademicSessionPolicy_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicSessionPolicy_plan_fkey" FOREIGN KEY ("academicYearPlanId","schoolId") REFERENCES "AcademicYearPlan"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicSessionPolicy_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicSessionPolicy_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicSessionPolicy_id_schoolId_key" ON "AcademicSessionPolicy"("id","schoolId");
CREATE UNIQUE INDEX "AcademicSessionPolicy_term_key" ON "AcademicSessionPolicy"("schoolId","termId");
CREATE UNIQUE INDEX "AcademicSessionPolicy_year_sequence_key" ON "AcademicSessionPolicy"("schoolId","academicYearId","sequence");
CREATE UNIQUE INDEX "AcademicSessionPolicy_one_year_end" ON "AcademicSessionPolicy"("schoolId","academicYearId") WHERE "isYearEnd" = true;
CREATE INDEX "AcademicSessionPolicy_year_status_idx" ON "AcademicSessionPolicy"("schoolId","academicYearId","closingStatus");

CREATE TABLE "GradingPeriod" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradingPeriod_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "GradingPeriod_range_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "GradingPeriod_status_check" CHECK ("status" IN ('active','closed')),
  CONSTRAINT "GradingPeriod_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GradingPeriod_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GradingPeriod_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GradingPeriod_id_schoolId_key" ON "GradingPeriod"("id","schoolId");
CREATE UNIQUE INDEX "GradingPeriod_term_sequence_key" ON "GradingPeriod"("schoolId","termId","sequence");
CREATE INDEX "GradingPeriod_year_term_idx" ON "GradingPeriod"("schoolId","academicYearId","termId");

CREATE TABLE "SchoolCalendarDay" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "calendarDate" DATE NOT NULL,
  "dayType" TEXT NOT NULL,
  "label" TEXT,
  "isInstructional" BOOLEAN NOT NULL DEFAULT false,
  "affectsAttendance" BOOLEAN NOT NULL DEFAULT true,
  "affectsTransport" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'generated',
  "note" TEXT,
  "overriddenBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolCalendarDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolCalendarDay_type_check" CHECK ("dayType" IN ('instructional','weekend','vacation','public_holiday','mid_term_break','staff_only','exam','closure','makeup','special')),
  CONSTRAINT "SchoolCalendarDay_source_check" CHECK ("source" IN ('generated','manual')),
  CONSTRAINT "SchoolCalendarDay_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SchoolCalendarDay_year_fkey" FOREIGN KEY ("academicYearId","schoolId") REFERENCES "AcademicYear"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolCalendarDay_overriddenBy_fkey" FOREIGN KEY ("overriddenBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SchoolCalendarDay_id_schoolId_key" ON "SchoolCalendarDay"("id","schoolId");
CREATE UNIQUE INDEX "SchoolCalendarDay_year_date_key" ON "SchoolCalendarDay"("schoolId","academicYearId","calendarDate");
CREATE INDEX "SchoolCalendarDay_school_date_idx" ON "SchoolCalendarDay"("schoolId","calendarDate");
CREATE INDEX "SchoolCalendarDay_year_type_idx" ON "SchoolCalendarDay"("schoolId","academicYearId","dayType");

-- Ensure a session policy cannot point at a Term from another academic year/plan.
CREATE OR REPLACE FUNCTION sukuunova_guard_academic_session_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE term_year TEXT; plan_year TEXT;
BEGIN
  SELECT "academicYearId" INTO term_year FROM "Term" WHERE "id"=NEW."termId" AND "schoolId"=NEW."schoolId";
  SELECT "academicYearId" INTO plan_year FROM "AcademicYearPlan" WHERE "id"=NEW."academicYearPlanId" AND "schoolId"=NEW."schoolId";
  IF term_year IS DISTINCT FROM NEW."academicYearId" OR plan_year IS DISTINCT FROM NEW."academicYearId" THEN
    RAISE EXCEPTION 'Academic session policy crosses academic years' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AcademicSessionPolicy_year_guard" BEFORE INSERT OR UPDATE ON "AcademicSessionPolicy" FOR EACH ROW EXECUTE FUNCTION sukuunova_guard_academic_session_policy();

-- Keep the orchestration state in sync when a legacy/current Term lock is toggled.
CREATE OR REPLACE FUNCTION sukuunova_sync_term_lock_to_session_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."isLocked" IS DISTINCT FROM OLD."isLocked" THEN
    UPDATE "AcademicSessionPolicy"
       SET "closingStatus" = CASE WHEN NEW."isLocked" THEN 'locked' ELSE 'open' END,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "schoolId"=NEW."schoolId" AND "termId"=NEW."id";
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "Term_sync_session_policy_lock" ON "Term";
CREATE TRIGGER "Term_sync_session_policy_lock" AFTER UPDATE OF "isLocked" ON "Term" FOR EACH ROW EXECUTE FUNCTION sukuunova_sync_term_lock_to_session_policy();

-- Backfill existing years/terms without guessing whether the last legacy term is a promotion term.
INSERT INTO "AcademicYearPlan" ("id","schoolId","academicYearId","patternKey","status","createdBy")
SELECT 'ayp_' || ay."id", ay."schoolId", ay."id", 'custom', CASE WHEN ay."isLocked" THEN 'closed' ELSE 'active' END, NULL
FROM "AcademicYear" ay
ON CONFLICT ("schoolId","academicYearId") DO NOTHING;

INSERT INTO "AcademicSessionPolicy" ("id","schoolId","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus")
SELECT 'asp_' || t."id", t."schoolId", p."id", t."academicYearId", t."id",
       ROW_NUMBER() OVER (PARTITION BY t."schoolId",t."academicYearId" ORDER BY t."startDate",t."id")::int,
       'custom', false, CASE WHEN t."isLocked" THEN 'locked' ELSE 'open' END
FROM "Term" t
JOIN "AcademicYearPlan" p ON p."schoolId"=t."schoolId" AND p."academicYearId"=t."academicYearId"
ON CONFLICT ("schoolId","termId") DO NOTHING;

INSERT INTO "GradingPeriod" ("id","schoolId","academicYearId","termId","name","sequence","startDate","endDate","isFinal","status")
SELECT 'gp_' || t."id", t."schoolId", t."academicYearId", t."id", t."name" || ' Final', 1,
       t."startDate"::date, t."endDate"::date, true, CASE WHEN t."isLocked" THEN 'closed' ELSE 'active' END
FROM "Term" t
ON CONFLICT ("schoolId","termId","sequence") DO NOTHING;

-- Tenant isolation for every new school-owned table.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['AcademicYearPlan','AcademicSessionPolicy','GradingPeriod','SchoolCalendarDay'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), '''')) WITH CHECK ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), ''''))',
      lower(table_name) || '_tenant', table_name
    );
  END LOOP;
END $$;
