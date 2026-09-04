CREATE TABLE IF NOT EXISTS "PlatformAdminMeta" (
  "adminId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAdminMeta_pkey" PRIMARY KEY ("adminId"),
  CONSTRAINT "PlatformAdminMeta_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "PlatformAdminMeta" ("adminId")
SELECT "id" FROM "PlatformAdmin"
ON CONFLICT ("adminId") DO NOTHING;

ALTER TABLE "PlatformAdminMeta"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
