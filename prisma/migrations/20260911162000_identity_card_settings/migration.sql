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

-- IdentityCard is FORCE-RLS protected, so existing active card expiries are
-- aligned lazily inside the authenticated tenant transaction when the ID-card
-- workspace is next opened. That keeps the migration fail-closed and tenant-safe.

ALTER TABLE "IdentityCardSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityCardSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IdentityCardSetting_tenant_isolation"
  ON "IdentityCardSetting"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
