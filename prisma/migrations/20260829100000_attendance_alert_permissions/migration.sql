INSERT INTO "Permission" ("id","key","description") VALUES
  (replace(gen_random_uuid()::text,'-',''),'attendance:review','Review attendance exceptions and investigate attendance decisions.'),
  (replace(gen_random_uuid()::text,'-',''),'guardian_alerts:view','View guardian alert history and delivery status.'),
  (replace(gen_random_uuid()::text,'-',''),'guardian_alerts:manage','Create and queue guardian attendance alerts.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."isSystem" = true
  AND r."name" IN ('Owner','Principal','Vice Principal','Academic Coordinator','Department Head','Class Teacher','Front Desk/Gate Security','HR Officer')
  AND p."key" = 'attendance:review'
ON CONFLICT ("roleId","permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."isSystem" = true
  AND r."name" IN ('Owner','Principal','Vice Principal','Academic Coordinator','Department Head')
  AND p."key" IN ('guardian_alerts:view','guardian_alerts:manage')
ON CONFLICT ("roleId","permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."isSystem" = true
  AND r."name" IN ('Class Teacher')
  AND p."key" = 'guardian_alerts:view'
ON CONFLICT ("roleId","permissionId") DO NOTHING;
