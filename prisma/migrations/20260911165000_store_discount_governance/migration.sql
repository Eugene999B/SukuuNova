-- Release D store governance: discounts are a separately delegated financial action.

INSERT INTO "Permission" ("id","key","description")
VALUES ('perm-store-discount','store:discount','Apply discounts to school store sales.')
ON CONFLICT ("key") DO UPDATE SET "description"=EXCLUDED."description";

-- Owners/Administrators/Principals inherit the full canonical permission set; Accountants
-- may also apply governed discounts as part of the finance/store workflow. Ordinary cashiers
-- with store:sell do not receive this permission automatically.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key"='store:discount'
WHERE r."name" IN ('Owner','Administrator','Principal','Accountant')
   OR r."key" IN ('owner','administrator','principal','accountant')
ON CONFLICT DO NOTHING;
