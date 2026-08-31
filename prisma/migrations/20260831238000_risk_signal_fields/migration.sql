-- Risk signals must survive the earlier schema-reset migration. Recreate the
-- table only when it is genuinely absent, preserving any existing records.
CREATE TABLE IF NOT EXISTS "StudentRiskFlag" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "expiresAt" TIMESTAMP(3),
  "reviewStatus" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedTo" TEXT,
  "resolution" TEXT,
  CONSTRAINT "StudentRiskFlag_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "resolution" TEXT;

CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_student_reason_idx" ON "StudentRiskFlag"("schoolId","studentId","reason");
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_resolved_idx" ON "StudentRiskFlag"("schoolId","resolvedAt");
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_severity_idx" ON "StudentRiskFlag"("schoolId","severity","flaggedAt");
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_review_idx" ON "StudentRiskFlag"("schoolId","reviewStatus","expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentRiskFlag_school_fkey'
  ) THEN
    ALTER TABLE "StudentRiskFlag"
      ADD CONSTRAINT "StudentRiskFlag_school_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentRiskFlag_student_fkey'
  ) THEN
    ALTER TABLE "StudentRiskFlag"
      ADD CONSTRAINT "StudentRiskFlag_student_fkey"
      FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentRiskFlag_assignee_school_fkey'
  ) THEN
    ALTER TABLE "StudentRiskFlag"
      ADD CONSTRAINT "StudentRiskFlag_assignee_school_fkey"
      FOREIGN KEY ("assignedTo","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StudentRiskFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentRiskFlag" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'StudentRiskFlag' AND policyname = 'StudentRiskFlag_tenant_isolation'
  ) THEN
    CREATE POLICY "StudentRiskFlag_tenant_isolation"
      ON "StudentRiskFlag"
      USING ("schoolId" = sukuunova_current_school_id())
      WITH CHECK ("schoolId" = sukuunova_current_school_id());
  END IF;
END $$;
