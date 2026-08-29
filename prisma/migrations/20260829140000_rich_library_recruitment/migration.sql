ALTER TABLE "P3LibraryBook"
  ADD COLUMN IF NOT EXISTS "materialType" TEXT NOT NULL DEFAULT 'book',
  ADD COLUMN IF NOT EXISTS "coverUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "fileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "publisher" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "language" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "accessibility" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "P3RecruitmentPosting"
  ADD COLUMN IF NOT EXISTS "publicToken" TEXT,
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "screeningQuestions" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "P3Applicant"
  ADD COLUMN IF NOT EXISTS "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "coverLetter" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "P3RecruitmentPosting_publicToken_key"
  ON "P3RecruitmentPosting" ("publicToken")
  WHERE "publicToken" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_materialType_idx"
  ON "P3LibraryBook" ("schoolId", "materialType");

CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_category_idx"
  ON "P3LibraryBook" ("schoolId", "category");

CREATE INDEX IF NOT EXISTS "P3RecruitmentPosting_school_publicToken_idx"
  ON "P3RecruitmentPosting" ("schoolId", "publicToken");
