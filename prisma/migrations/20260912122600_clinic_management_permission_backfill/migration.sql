-- Backfill Clinic management-only permissions for existing school leadership roles.
-- Role and RolePermission are FORCE-RLS tables; migrations run without a tenant context,
-- so disable RLS only for this controlled catalogue backfill and restore it immediately.

ALTER TABLE "Role" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" DISABLE ROW LEVEL SECURITY;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('clinic:overview','clinic:nurses_manage')
WHERE COALESCE(r."key", '') IN ('owner','administrator','principal','vice_principal')
   OR r."name" IN ('Owner','Administrator','Principal','Vice Principal','Vice Principal / Deputy Head')
ON CONFLICT DO NOTHING;

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
