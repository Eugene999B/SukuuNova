CREATE TABLE "AiRequest" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "featureName" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputRecordIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "inputDataHash" TEXT NOT NULL,
  "output" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvalStatus" TEXT NOT NULL DEFAULT 'SUGGESTED',
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRequest_school_created_idx" ON "AiRequest"("schoolId","createdAt");
CREATE INDEX "AiRequest_school_feature_status_idx" ON "AiRequest"("schoolId","featureName","approvalStatus");

ALTER TABLE "AiRequest"
  ADD CONSTRAINT "AiRequest_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiRequest"
  ADD CONSTRAINT "AiRequest_user_fkey"
  FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  ALTER TABLE "AiRequest" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "AiRequest" FORCE ROW LEVEL SECURITY;
  CREATE POLICY "AiRequest_tenant_isolation" ON "AiRequest"
    USING ("schoolId" = sukuunova_current_school_id())
    WITH CHECK ("schoolId" = sukuunova_current_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
