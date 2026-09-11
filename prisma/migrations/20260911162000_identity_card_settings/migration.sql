-- School-controlled identity-card validity policy.
-- Existing schools default to five years (60 months). The setting applies to
-- student and staff credentials and is tenant-isolated like the card records.

CREATE TABLE "IdentityCardSetting" (
  "schoolId" TEXT NOT NULL,
  "validityMonths" INTEGER NOT NULL DEFAULT 60,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityCardSetting_pkey" PRIMARY KEY ("schoolId"),
  CONSTRAINT "IdentityCardSetting_validity_check" CHECK ("validityMonths" BETWEEN 1 AND 120),
  CONSTRAINT "IdentityCardSetting_school_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "IdentityCardSetting" ("schoolId", "validityMonths")
SELECT "id", 60 FROM "School"
ON CONFLICT ("schoolId") DO NOTHING;

-- Bring existing active credentials onto the new five-year policy. Bumping the
-- version intentionally invalidates older printed QR signatures so the next
-- download becomes the authoritative credential after this policy change.
UPDATE "IdentityCard"
SET "expiresAt" = "issuedAt" + INTERVAL '60 months',
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active';

ALTER TABLE "IdentityCardSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityCardSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IdentityCardSetting_tenant_isolation"
  ON "IdentityCardSetting"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
