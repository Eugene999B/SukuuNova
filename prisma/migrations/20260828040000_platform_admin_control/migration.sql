CREATE TABLE "PlatformAdminMeta" (
  "adminId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAdminMeta_pkey" PRIMARY KEY ("adminId"),
  CONSTRAINT "PlatformAdminMeta_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PlatformAdminPermission" (
  "adminId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  CONSTRAINT "PlatformAdminPermission_pkey" PRIMARY KEY ("adminId","permission"),
  CONSTRAINT "PlatformAdminPermission_admin_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlatformAdminPermission_permission_idx" ON "PlatformAdminPermission"("permission");
INSERT INTO "PlatformAdminMeta" ("adminId") SELECT "id" FROM "PlatformAdmin" ON CONFLICT DO NOTHING;
INSERT INTO "PlatformAdminPermission" ("adminId","permission")
SELECT a."id", p."permission" FROM "PlatformAdmin" a CROSS JOIN (VALUES
 ('schools.view'),('schools.manage'),('schools.suspend'),('schools.impersonate'),('billing.view'),('billing.manage'),('plans.manage'),('analytics.view'),('support.view'),('support.manage'),('admins.view'),('admins.manage'),('audit.view'),('security.manage'),('settings.manage')
) AS p(permission) WHERE a."role"='super_admin' ON CONFLICT DO NOTHING;
