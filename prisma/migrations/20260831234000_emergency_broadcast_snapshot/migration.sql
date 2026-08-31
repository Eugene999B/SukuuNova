CREATE TABLE "EmergencyBroadcast" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "recipientSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
  "confirmationTokenHash" TEXT NOT NULL,
  "confirmationExpiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmergencyBroadcast_token_hash_key"
  ON "EmergencyBroadcast" ("confirmationTokenHash");
CREATE INDEX "EmergencyBroadcast_school_status_created_idx"
  ON "EmergencyBroadcast" ("schoolId", "status", "createdAt");

ALTER TABLE "EmergencyBroadcast"
  ADD CONSTRAINT "EmergencyBroadcast_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmergencyBroadcast"
  ADD CONSTRAINT "EmergencyBroadcast_actor_fkey"
  FOREIGN KEY ("actorId", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmergencyBroadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyBroadcast" FORCE ROW LEVEL SECURITY;
CREATE POLICY "EmergencyBroadcast_tenant_isolation"
  ON "EmergencyBroadcast"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
