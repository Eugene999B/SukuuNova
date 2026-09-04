INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (md5('sukuunova:support:create'), 'support:create', 'Create a support ticket for the school workspace.'),
  (md5('sukuunova:support:view_own'), 'support:view_own', 'View support tickets raised by the current school account.'),
  (md5('sukuunova:support:manage'), 'support:manage', 'View and manage all school support tickets.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("schoolId", "roleId", "permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('support:create','support:view_own','support:manage')
WHERE r."name" IN ('Owner','Principal','Vice Principal')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("schoolId", "roleId", "permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('support:create','support:view_own')
WHERE r."name" IN (
  'Academic Coordinator',
  'Department Head',
  'Accountant',
  'HR Officer',
  'Admissions Officer',
  'Class Teacher',
  'Subject Teacher',
  'Front Desk/Gate Security',
  'Transport Officer'
)
ON CONFLICT DO NOTHING;
