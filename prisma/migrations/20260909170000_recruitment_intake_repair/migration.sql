-- Restore rich fields lost during the historical operations-table recreation.
ALTER TABLE "P3RecruitmentPosting"
 ADD COLUMN IF NOT EXISTS "publicToken" TEXT,
 ADD COLUMN IF NOT EXISTS "instructions" TEXT,
 ADD COLUMN IF NOT EXISTS "screeningQuestions" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "P3Applicant"
 ADD COLUMN IF NOT EXISTS "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS "coverLetter" TEXT,
 ADD COLUMN "submissionKey" TEXT,
 ADD COLUMN "submissionHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "P3RecruitmentPosting_publicToken_key" ON "P3RecruitmentPosting"("publicToken") WHERE "publicToken" IS NOT NULL;
CREATE UNIQUE INDEX "P3Applicant_submissionKey_key" ON "P3Applicant"("schoolId","postingId","submissionKey") WHERE "submissionKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "P3RecruitmentPosting_school_publicToken_idx" ON "P3RecruitmentPosting"("schoolId","publicToken");
