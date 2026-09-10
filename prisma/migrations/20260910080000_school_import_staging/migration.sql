-- School data imports are staged and validated before any authoritative school record is changed.
CREATE TABLE "SchoolImportBatch" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "originalHeaders" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "normalizedHeaders" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "columnMapping" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "validatedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolImportBatch_kind_check" CHECK ("kind" IN ('students','guardians','staff','classes','subjects','opening_balances')),
  CONSTRAINT "SchoolImportBatch_status_check" CHECK ("status" IN ('uploaded','mapped','validated','ready','applying','applied','failed','cancelled')),
  CONSTRAINT "SchoolImportBatch_sourceSha256_check" CHECK ("sourceSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SchoolImportBatch_counts_check" CHECK ("rowCount" >= 0 AND "validRows" >= 0 AND "invalidRows" >= 0 AND "duplicateRows" >= 0)
);

CREATE UNIQUE INDEX "SchoolImportBatch_id_schoolId_key" ON "SchoolImportBatch"("id", "schoolId");
CREATE INDEX "SchoolImportBatch_schoolId_createdAt_idx" ON "SchoolImportBatch"("schoolId", "createdAt" DESC);
CREATE INDEX "SchoolImportBatch_schoolId_status_idx" ON "SchoolImportBatch"("schoolId", "status");

ALTER TABLE "SchoolImportBatch"
  ADD CONSTRAINT "SchoolImportBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolImportBatch"
  ADD CONSTRAINT "SchoolImportBatch_createdBy_tenant_fkey" FOREIGN KEY ("createdBy", "schoolId") REFERENCES "User"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SchoolImportRow" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "validationErrors" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "duplicateKeys" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "appliedEntityType" TEXT,
  "appliedEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolImportRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolImportRow_rowNumber_check" CHECK ("rowNumber" >= 2),
  CONSTRAINT "SchoolImportRow_status_check" CHECK ("status" IN ('pending','valid','invalid','duplicate','applied','skipped'))
);

CREATE UNIQUE INDEX "SchoolImportRow_schoolId_batchId_rowNumber_key" ON "SchoolImportRow"("schoolId", "batchId", "rowNumber");
CREATE INDEX "SchoolImportRow_schoolId_batchId_status_idx" ON "SchoolImportRow"("schoolId", "batchId", "status");

ALTER TABLE "SchoolImportRow"
  ADD CONSTRAINT "SchoolImportRow_batch_tenant_fkey" FOREIGN KEY ("batchId", "schoolId") REFERENCES "SchoolImportBatch"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolImportRow"
  ADD CONSTRAINT "SchoolImportRow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolImportBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_import_batch_tenant" ON "SchoolImportBatch"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "SchoolImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolImportRow" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_import_row_tenant" ON "SchoolImportRow"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
