-- Finance V2 scholarship governance: request and approval are separate duties.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('perm_fin_scholar_approve_v2','finance:scholarships_approve','Approve or reject scholarship requests created by another staff member')
ON CONFLICT ("key") DO NOTHING;

-- Leadership can request and approve, but the canonical adjustment guard still blocks
-- the same person from approving their own request.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId",r."id",p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" IN ('Owner','Administrator','Principal')
  AND p."key"='finance:scholarships_approve'
ON CONFLICT DO NOTHING;

-- Accounts can prepare scholarship requests but cannot approve them by default.
INSERT INTO "RolePermission" ("schoolId","roleId","permissionId")
SELECT r."schoolId",r."id",p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name"='Accountant'
  AND p."key"='finance:scholarships_manage'
ON CONFLICT DO NOTHING;

ALTER TABLE "FinanceScholarshipAward" DROP CONSTRAINT IF EXISTS "FinanceScholarshipAward_status_check";
ALTER TABLE "FinanceScholarshipAward"
  ADD CONSTRAINT "FinanceScholarshipAward_status_check"
  CHECK ("status" IN ('pending','active','rejected','revoked','expired'));

CREATE INDEX IF NOT EXISTS "FinanceScholarshipAward_school_status_idx"
  ON "FinanceScholarshipAward"("schoolId","status","createdAt");
