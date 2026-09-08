-- Platform-owner session invalidation support.
-- Additive only: no existing columns or records are removed.

CREATE TABLE IF NOT EXISTS "SchoolUserSessionEpoch" (
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolUserSessionEpoch_pkey" PRIMARY KEY ("schoolId", "userId")
);

CREATE INDEX IF NOT EXISTS "SchoolUserSessionEpoch_school_updated_idx"
  ON "SchoolUserSessionEpoch"("schoolId", "updatedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolUserSessionEpoch_user_fkey') THEN
    ALTER TABLE "SchoolUserSessionEpoch"
      ADD CONSTRAINT "SchoolUserSessionEpoch_user_fkey"
      FOREIGN KEY ("userId", "schoolId") REFERENCES "User"("id", "schoolId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "SchoolUserSessionEpoch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolUserSessionEpoch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SchoolUserSessionEpoch_tenant" ON "SchoolUserSessionEpoch";
CREATE POLICY "SchoolUserSessionEpoch_tenant" ON "SchoolUserSessionEpoch"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
