INSERT INTO "Permission" ("id","key","description")
VALUES ('perm-payments-reverse','payments:reverse','Reverse a recorded school payment with an audit reason')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'payments:reverse'
  AND r."name" IN ('Owner','Principal','Vice Principal','Accountant')
ON CONFLICT DO NOTHING;
