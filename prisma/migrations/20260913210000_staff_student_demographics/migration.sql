-- Staff profile + learner demographics
-- Adds durable personnel data without turning User into an HR record, and
-- carries the gender already captured by Admissions into the official Student.

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "gender" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Student_gender_check'
  ) THEN
    ALTER TABLE "Student"
      ADD CONSTRAINT "Student_gender_check"
      CHECK ("gender" IS NULL OR "gender" IN ('male','female','other','prefer_not_to_say'));
  END IF;
END $$;

UPDATE "Student" s
SET "gender" = CASE
  WHEN lower(trim(a."gender")) IN ('male','m','boy','man') THEN 'male'
  WHEN lower(trim(a."gender")) IN ('female','f','girl','woman') THEN 'female'
  WHEN lower(trim(a."gender")) = 'other' THEN 'other'
  WHEN lower(trim(a."gender")) IN ('prefer_not_to_say','prefer not to say','prefer-not-to-say','undisclosed') THEN 'prefer_not_to_say'
  ELSE NULL
END
FROM "AdmissionApplication" a
WHERE a."schoolId" = s."schoolId"
  AND a."convertedStudentId" = s."id"
  AND s."gender" IS NULL
  AND a."gender" IS NOT NULL;

CREATE TABLE "StaffProfile" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "staffNumber" TEXT NOT NULL,
  "gender" TEXT,
  "dob" DATE,
  "nationality" TEXT,
  "dateJoined" DATE,
  "staffType" TEXT,
  "staffCategory" TEXT,
  "jobTitle" TEXT,
  "department" TEXT,
  "employmentStatus" TEXT NOT NULL DEFAULT 'active',
  "employmentType" TEXT,
  "highestQualification" TEXT,
  "professionalQualification" TEXT,
  "residentialAddress" TEXT,
  "emergencyContactName" TEXT,
  "emergencyContactPhone" TEXT,
  "emergencyContactRelationship" TEXT,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffProfile_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('male','female','other','prefer_not_to_say')),
  CONSTRAINT "StaffProfile_staffType_check" CHECK ("staffType" IS NULL OR "staffType" IN ('teaching','non-teaching')),
  CONSTRAINT "StaffProfile_employmentStatus_check" CHECK ("employmentStatus" IN ('active','on_leave','inactive','terminated')),
  CONSTRAINT "StaffProfile_employmentType_check" CHECK ("employmentType" IS NULL OR "employmentType" IN ('full_time','part_time','contract','temporary','intern','nss','other')),
  CONSTRAINT "StaffProfile_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffProfile_user_fkey" FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StaffProfile_id_schoolId_key" ON "StaffProfile"("id","schoolId");
CREATE UNIQUE INDEX "StaffProfile_schoolId_userId_key" ON "StaffProfile"("schoolId","userId");
CREATE UNIQUE INDEX "StaffProfile_schoolId_staffNumber_key" ON "StaffProfile"("schoolId","staffNumber");
CREATE INDEX "StaffProfile_schoolId_gender_idx" ON "StaffProfile"("schoolId","gender");
CREATE INDEX "StaffProfile_schoolId_staffType_idx" ON "StaffProfile"("schoolId","staffType");
CREATE INDEX "StaffProfile_schoolId_department_idx" ON "StaffProfile"("schoolId","department");
CREATE INDEX "StaffProfile_schoolId_employmentStatus_idx" ON "StaffProfile"("schoolId","employmentStatus");

WITH staff_users AS (
  SELECT
    u."id",
    u."schoolId",
    u."createdAt",
    u."status",
    ROW_NUMBER() OVER (PARTITION BY u."schoolId" ORDER BY u."createdAt", u."id") AS rn,
    EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
      WHERE ur."schoolId"=u."schoolId" AND ur."userId"=u."id"
        AND COALESCE(NULLIF(trim(r."key"),''), regexp_replace(lower(trim(r."name")), '[^a-z0-9]+', '_', 'g'))
            IN ('teacher','class_teacher','subject_teacher','academic_coordinator','department_head')
    ) AS is_teaching,
    (
      SELECT r."name"
      FROM "UserRole" ur
      JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
      WHERE ur."schoolId"=u."schoolId" AND ur."userId"=u."id"
        AND COALESCE(NULLIF(trim(r."key"),''), regexp_replace(lower(trim(r."name")), '[^a-z0-9]+', '_', 'g'))
            NOT IN ('parent','guardian','student')
      ORDER BY r."isSystem" DESC, r."name" ASC
      LIMIT 1
    ) AS primary_role
  FROM "User" u
  WHERE NOT EXISTS (
      SELECT 1 FROM "UserRole" ur WHERE ur."schoolId"=u."schoolId" AND ur."userId"=u."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
      WHERE ur."schoolId"=u."schoolId" AND ur."userId"=u."id"
        AND COALESCE(NULLIF(trim(r."key"),''), regexp_replace(lower(trim(r."name")), '[^a-z0-9]+', '_', 'g'))
            NOT IN ('parent','guardian','student')
    )
)
INSERT INTO "StaffProfile" (
  "id","schoolId","userId","staffNumber","staffType","jobTitle","employmentStatus"
)
SELECT
  'sp_' || su."id",
  su."schoolId",
  su."id",
  'STF-' || to_char(su."createdAt", 'YYYY') || '-' || lpad(su.rn::text, 4, '0'),
  CASE WHEN su.is_teaching THEN 'teaching' ELSE 'non-teaching' END,
  su.primary_role,
  CASE WHEN su."status"='suspended' THEN 'inactive' ELSE 'active' END
FROM staff_users su
ON CONFLICT ("schoolId","userId") DO NOTHING;

ALTER TABLE "StaffProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staffprofile_tenant" ON "StaffProfile"
  USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
  WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

CREATE OR REPLACE FUNCTION sukuunova_ensure_staff_profile_from_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE role_row RECORD; normalized_key TEXT; profile_type TEXT; tenant_school TEXT;
BEGIN
  tenant_school := NULLIF(current_setting('app.current_school_id', true), '');
  IF tenant_school IS DISTINCT FROM NEW."schoolId" THEN RETURN NEW; END IF;

  SELECT "name","key" INTO role_row
    FROM "Role"
   WHERE "id"=NEW."roleId" AND "schoolId"=NEW."schoolId";
  IF NOT FOUND THEN RETURN NEW; END IF;

  normalized_key := COALESCE(NULLIF(trim(role_row."key"),''), regexp_replace(lower(trim(role_row."name")), '[^a-z0-9]+', '_', 'g'));
  IF normalized_key IN ('parent','guardian','student') THEN RETURN NEW; END IF;

  profile_type := CASE
    WHEN normalized_key IN ('teacher','class_teacher','subject_teacher','academic_coordinator','department_head') THEN 'teaching'
    ELSE 'non-teaching'
  END;

  INSERT INTO "StaffProfile" (
    "id","schoolId","userId","staffNumber","staffType","jobTitle","employmentStatus"
  ) VALUES (
    'sp_' || NEW."userId",
    NEW."schoolId",
    NEW."userId",
    'STF-' || to_char(CURRENT_DATE,'YYYY') || '-' || upper(substr(md5(NEW."schoolId" || ':' || NEW."userId"),1,6)),
    profile_type,
    role_row."name",
    'active'
  )
  ON CONFLICT ("schoolId","userId") DO UPDATE SET
    "staffType" = CASE WHEN EXCLUDED."staffType"='teaching' THEN 'teaching' ELSE "StaffProfile"."staffType" END,
    "jobTitle" = COALESCE("StaffProfile"."jobTitle", EXCLUDED."jobTitle"),
    "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "UserRole_ensure_staff_profile" ON "UserRole";
CREATE TRIGGER "UserRole_ensure_staff_profile"
AFTER INSERT ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION sukuunova_ensure_staff_profile_from_role();

CREATE OR REPLACE FUNCTION sukuunova_normalize_admission_gender()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE raw_gender TEXT;
BEGIN
  raw_gender := lower(trim(COALESCE(NEW."gender",'')));
  IF raw_gender = '' THEN
    NEW."gender" := NULL;
  ELSIF raw_gender IN ('male','m','boy','man') THEN
    NEW."gender" := 'male';
  ELSIF raw_gender IN ('female','f','girl','woman') THEN
    NEW."gender" := 'female';
  ELSIF raw_gender = 'other' THEN
    NEW."gender" := 'other';
  ELSIF raw_gender IN ('prefer_not_to_say','prefer not to say','prefer-not-to-say','undisclosed') THEN
    NEW."gender" := 'prefer_not_to_say';
  ELSE
    RAISE EXCEPTION 'Choose a valid gender value.' USING ERRCODE='23514';
  END IF;

  IF NEW."status" <> 'draft' AND NEW."gender" IS NULL THEN
    RAISE EXCEPTION 'Gender is required before an admission application can be submitted.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "AdmissionApplication_normalize_gender" ON "AdmissionApplication";
CREATE TRIGGER "AdmissionApplication_normalize_gender"
BEFORE INSERT OR UPDATE OF "gender","status" ON "AdmissionApplication"
FOR EACH ROW EXECUTE FUNCTION sukuunova_normalize_admission_gender();

CREATE OR REPLACE FUNCTION sukuunova_sync_admission_gender_to_student()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."convertedStudentId" IS NOT NULL AND NEW."gender" IS NOT NULL THEN
    UPDATE "Student"
       SET "gender" = NEW."gender"
     WHERE "id"=NEW."convertedStudentId" AND "schoolId"=NEW."schoolId";
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "AdmissionApplication_sync_student_gender" ON "AdmissionApplication";
CREATE TRIGGER "AdmissionApplication_sync_student_gender"
AFTER INSERT OR UPDATE OF "convertedStudentId","gender" ON "AdmissionApplication"
FOR EACH ROW EXECUTE FUNCTION sukuunova_sync_admission_gender_to_student();
