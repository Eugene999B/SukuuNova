ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "StudentRiskFlag" ADD COLUMN IF NOT EXISTS "resolution" TEXT;

CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_severity_idx" ON "StudentRiskFlag"("schoolId","severity","flaggedAt");
CREATE INDEX IF NOT EXISTS "StudentRiskFlag_school_review_idx" ON "StudentRiskFlag"("schoolId","reviewStatus","expiresAt");

ALTER TABLE "StudentRiskFlag"
  ADD CONSTRAINT "StudentRiskFlag_assignee_school_fkey"
  FOREIGN KEY ("assignedTo","schoolId") REFERENCES "User"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE;
