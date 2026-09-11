-- Repair the identity-card feature for existing schools.
-- The feature code and canonical role baselines already reference
-- identity_cards:manage, but the original identity-card migration only created
-- the credential table. Existing production schools can therefore fail closed
-- before the ID-card workspace renders and hide ID-card controls entirely.

INSERT INTO "Permission" ("id", "key", "description")
VALUES (
  md5('sukuunova:identity_cards:manage'),
  'identity_cards:manage',
  'Issue, print, reissue, revoke and verify school identity cards.'
)
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description";

-- Backfill only canonical system roles whose default SukuuNova baseline already
-- includes identity_cards:manage. Custom roles remain governed by the school.
INSERT INTO "RolePermission" ("schoolId", "roleId", "permissionId")
SELECT r."schoolId", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" = 'identity_cards:manage'
WHERE r."isSystem" = TRUE
  AND r."key" IN (
    'owner',
    'administrator',
    'principal',
    'vice_principal',
    'academic_coordinator',
    'department_head',
    'hr_officer',
    'admissions_officer',
    'front_desk_security'
  )
ON CONFLICT DO NOTHING;
