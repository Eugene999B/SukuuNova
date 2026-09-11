-- Keep the database family/staff boundary safe while preserving legacy role-less school staff.
-- Application services remain stricter and only expose explicitly staffed accounts in pickers.
CREATE OR REPLACE FUNCTION sukuunova_active_staff(p_school_id TEXT, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "User" u
    WHERE u."id" = p_user_id
      AND u."schoolId" = p_school_id
      AND u."status" = 'active'
      AND (
        NOT EXISTS (
          SELECT 1
          FROM "UserRole" ur_any
          WHERE ur_any."userId" = u."id"
            AND ur_any."schoolId" = u."schoolId"
        )
        OR EXISTS (
          SELECT 1
          FROM "UserRole" ur
          JOIN "Role" r
            ON r."id" = ur."roleId"
           AND r."schoolId" = ur."schoolId"
          WHERE ur."userId" = u."id"
            AND ur."schoolId" = u."schoolId"
            AND COALESCE(NULLIF(BTRIM(r."key"), ''), LOWER(REGEXP_REPLACE(BTRIM(r."name"), '[^a-zA-Z0-9]+', '_', 'g')))
                NOT IN ('parent', 'guardian', 'student')
        )
      )
  );
$$;
