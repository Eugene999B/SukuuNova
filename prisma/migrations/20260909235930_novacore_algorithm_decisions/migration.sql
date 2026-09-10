-- NovaCore algorithm decision telemetry.
-- Stores explainable decision metadata only. Raw learner, guardian, signature, biometric and GPS payloads must remain in their domain stores.

CREATE TABLE "NovaCoreDecision" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "algorithmKey" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "rolloutMode" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "inputFingerprint" TEXT,
  "confidence" DECIMAL(6,5),
  "reasonCodes" JSONB NOT NULL DEFAULT '[]',
  "outputSummary" JSONB NOT NULL DEFAULT '{}',
  "shadowGroupKey" TEXT,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NovaCoreDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NovaCoreDecision_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NovaCoreDecision_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "NovaCoreDecision_latency_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0)
);

CREATE UNIQUE INDEX "NovaCoreDecision_id_schoolId_key" ON "NovaCoreDecision"("id","schoolId");
CREATE INDEX "NovaCoreDecision_school_algorithm_created_idx" ON "NovaCoreDecision"("schoolId","algorithmKey","createdAt" DESC);
CREATE INDEX "NovaCoreDecision_school_entity_created_idx" ON "NovaCoreDecision"("schoolId","entityType","entityId","createdAt" DESC);
CREATE INDEX "NovaCoreDecision_school_shadow_created_idx" ON "NovaCoreDecision"("schoolId","shadowGroupKey","createdAt" DESC) WHERE "shadowGroupKey" IS NOT NULL;

ALTER TABLE "NovaCoreDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NovaCoreDecision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "NovaCoreDecision_tenant_isolation" ON "NovaCoreDecision"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
