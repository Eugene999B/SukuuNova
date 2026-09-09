-- The operations-table restoration recreated the base catalogue after its rich metadata migration.
-- Restore missing columns additively; retain existing catalogue values and deployed migration history.
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


CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_materialType_idx" ON "P3LibraryBook" ("schoolId", "materialType");
CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_category_idx" ON "P3LibraryBook" ("schoolId", "category");
