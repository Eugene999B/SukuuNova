CREATE TABLE "SyncOperation" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "clientOperationId" TEXT NOT NULL,
  "clientVersion" INTEGER NOT NULL,
  "entityId" TEXT,
  "operationType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "result" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncOperation_school_device_operation_key"
  ON "SyncOperation" ("schoolId", "deviceId", "clientOperationId");
CREATE INDEX "SyncOperation_school_status_created_idx"
  ON "SyncOperation" ("schoolId", "status", "createdAt");
CREATE INDEX "SyncOperation_school_device_created_idx"
  ON "SyncOperation" ("schoolId", "deviceId", "createdAt");

ALTER TABLE "SyncOperation"
  ADD CONSTRAINT "SyncOperation_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyncOperation"
  ADD CONSTRAINT "SyncOperation_device_fkey"
  FOREIGN KEY ("deviceId", "schoolId") REFERENCES "Device"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyncOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncOperation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SyncOperation_tenant_isolation"
  ON "SyncOperation"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
