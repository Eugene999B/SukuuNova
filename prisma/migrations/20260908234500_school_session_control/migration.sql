-- Revocable session epochs for school-wide and individual-account sign-out.
-- Existing sessions implicitly use epoch 0 until an operator rotates an epoch.

CREATE TABLE IF NOT EXISTS "SchoolSessionEpoch" (
  "schoolId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolSessionEpoch_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "SchoolSessionEpoch_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SchoolUserSessionEpoch" (
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolUserSessionEpoch_pkey" PRIMARY KEY ("schoolId", "userId"),
  CONSTRAINT "SchoolUserSessionEpoch_user_fkey" FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolUserSessionEpoch_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SchoolUserSessionEpoch_school_idx" ON "SchoolUserSessionEpoch"("schoolId");

ALTER TABLE "SchoolSessionEpoch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolSessionEpoch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SchoolSessionEpoch_tenant" ON "SchoolSessionEpoch";
CREATE POLICY "SchoolSessionEpoch_tenant" ON "SchoolSessionEpoch"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "SchoolUserSessionEpoch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolUserSessionEpoch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SchoolUserSessionEpoch_tenant" ON "SchoolUserSessionEpoch";
CREATE POLICY "SchoolUserSessionEpoch_tenant" ON "SchoolUserSessionEpoch"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
