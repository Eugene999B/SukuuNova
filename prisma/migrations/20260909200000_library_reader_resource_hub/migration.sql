-- Deepen the existing Phase 3 library without replacing catalogue/circulation history.
-- Digital access is read-first. Download permission is an explicit school-controlled policy.

ALTER TABLE "P3LibraryBook"
  ADD COLUMN IF NOT EXISTS "readerEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "downloadAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'school',
  ADD COLUMN IF NOT EXISTS "audience" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "rightsNote" TEXT,
  ADD COLUMN IF NOT EXISTS "estimatedMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "P3LibraryBook" DROP CONSTRAINT IF EXISTS "P3LibraryBook_visibility_check";
ALTER TABLE "P3LibraryBook"
  ADD CONSTRAINT "P3LibraryBook_visibility_check"
  CHECK ("visibility" IN ('school','staff','restricted'));
ALTER TABLE "P3LibraryBook" DROP CONSTRAINT IF EXISTS "P3LibraryBook_estimated_minutes_check";
ALTER TABLE "P3LibraryBook"
  ADD CONSTRAINT "P3LibraryBook_estimated_minutes_check"
  CHECK ("estimatedMinutes" IS NULL OR ("estimatedMinutes" >= 1 AND "estimatedMinutes" <= 100000));

CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_visibility_idx"
  ON "P3LibraryBook"("schoolId","visibility","archivedAt");
CREATE INDEX IF NOT EXISTS "P3LibraryBook_school_reader_idx"
  ON "P3LibraryBook"("schoolId","readerEnabled","downloadAllowed");

CREATE TABLE IF NOT EXISTS "P3LibraryCopy" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "accessionNo" TEXT NOT NULL,
  "barcode" TEXT,
  "shelfLocation" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'good',
  "status" TEXT NOT NULL DEFAULT 'available',
  "acquiredAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3LibraryCopy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3LibraryCopy_condition_check" CHECK ("condition" IN ('new','good','fair','damaged','lost','withdrawn')),
  CONSTRAINT "P3LibraryCopy_status_check" CHECK ("status" IN ('available','on_loan','reserved','repair','lost','withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryCopy_id_schoolId_key" ON "P3LibraryCopy"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryCopy_school_accession_key" ON "P3LibraryCopy"("schoolId","accessionNo");
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryCopy_school_barcode_key" ON "P3LibraryCopy"("schoolId","barcode") WHERE "barcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "P3LibraryCopy_school_book_status_idx" ON "P3LibraryCopy"("schoolId","bookId","status");

ALTER TABLE "P3LibraryLoan" ADD COLUMN IF NOT EXISTS "copyId" TEXT;
CREATE INDEX IF NOT EXISTS "P3LibraryLoan_school_copy_status_idx" ON "P3LibraryLoan"("schoolId","copyId","status");

CREATE TABLE IF NOT EXISTS "P3LibraryReadingProgress" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "progressPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "lastPage" INTEGER,
  "totalPages" INTEGER,
  "lastPosition" TEXT,
  "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3LibraryReadingProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3LibraryReadingProgress_percent_check" CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100),
  CONSTRAINT "P3LibraryReadingProgress_pages_check" CHECK (("lastPage" IS NULL OR "lastPage" >= 0) AND ("totalPages" IS NULL OR "totalPages" >= 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryReadingProgress_id_schoolId_key" ON "P3LibraryReadingProgress"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryReadingProgress_school_book_student_key" ON "P3LibraryReadingProgress"("schoolId","bookId","studentId");
CREATE INDEX IF NOT EXISTS "P3LibraryReadingProgress_school_student_opened_idx" ON "P3LibraryReadingProgress"("schoolId","studentId","lastOpenedAt" DESC);

CREATE TABLE IF NOT EXISTS "P3LibraryBookmark" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "label" TEXT,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3LibraryBookmark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryBookmark_id_schoolId_key" ON "P3LibraryBookmark"("id","schoolId");
CREATE INDEX IF NOT EXISTS "P3LibraryBookmark_school_student_book_idx" ON "P3LibraryBookmark"("schoolId","studentId","bookId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "P3LibraryFavourite" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3LibraryFavourite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryFavourite_id_schoolId_key" ON "P3LibraryFavourite"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryFavourite_school_book_student_key" ON "P3LibraryFavourite"("schoolId","bookId","studentId");

CREATE TABLE IF NOT EXISTS "P3LibraryReservation" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "P3LibraryReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3LibraryReservation_status_check" CHECK ("status" IN ('waiting','ready','fulfilled','cancelled','expired'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryReservation_id_schoolId_key" ON "P3LibraryReservation"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryReservation_active_key" ON "P3LibraryReservation"("schoolId","bookId","studentId") WHERE "status" IN ('waiting','ready');
CREATE INDEX IF NOT EXISTS "P3LibraryReservation_school_book_queue_idx" ON "P3LibraryReservation"("schoolId","bookId","status","requestedAt");

CREATE TABLE IF NOT EXISTS "P3LibraryResourceAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "classId" TEXT,
  "studentId" TEXT,
  "subjectId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'recommended',
  "note" TEXT,
  "dueAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "P3LibraryResourceAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "P3LibraryResourceAssignment_kind_check" CHECK ("kind" IN ('recommended','required','reference'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "P3LibraryResourceAssignment_id_schoolId_key" ON "P3LibraryResourceAssignment"("id","schoolId");
CREATE INDEX IF NOT EXISTS "P3LibraryResourceAssignment_school_student_idx" ON "P3LibraryResourceAssignment"("schoolId","studentId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "P3LibraryResourceAssignment_school_class_idx" ON "P3LibraryResourceAssignment"("schoolId","classId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "P3LibraryResourceAssignment_school_subject_idx" ON "P3LibraryResourceAssignment"("schoolId","subjectId","createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryCopy_book_fkey') THEN
    ALTER TABLE "P3LibraryCopy" ADD CONSTRAINT "P3LibraryCopy_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryLoan_copy_fkey') THEN
    ALTER TABLE "P3LibraryLoan" ADD CONSTRAINT "P3LibraryLoan_copy_fkey" FOREIGN KEY ("copyId","schoolId") REFERENCES "P3LibraryCopy"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReadingProgress_book_fkey') THEN
    ALTER TABLE "P3LibraryReadingProgress" ADD CONSTRAINT "P3LibraryReadingProgress_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReadingProgress_student_fkey') THEN
    ALTER TABLE "P3LibraryReadingProgress" ADD CONSTRAINT "P3LibraryReadingProgress_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReadingProgress_user_fkey') THEN
    ALTER TABLE "P3LibraryReadingProgress" ADD CONSTRAINT "P3LibraryReadingProgress_user_fkey" FOREIGN KEY ("updatedBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryBookmark_book_fkey') THEN
    ALTER TABLE "P3LibraryBookmark" ADD CONSTRAINT "P3LibraryBookmark_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryBookmark_student_fkey') THEN
    ALTER TABLE "P3LibraryBookmark" ADD CONSTRAINT "P3LibraryBookmark_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryBookmark_user_fkey') THEN
    ALTER TABLE "P3LibraryBookmark" ADD CONSTRAINT "P3LibraryBookmark_user_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryFavourite_book_fkey') THEN
    ALTER TABLE "P3LibraryFavourite" ADD CONSTRAINT "P3LibraryFavourite_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryFavourite_student_fkey') THEN
    ALTER TABLE "P3LibraryFavourite" ADD CONSTRAINT "P3LibraryFavourite_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryFavourite_user_fkey') THEN
    ALTER TABLE "P3LibraryFavourite" ADD CONSTRAINT "P3LibraryFavourite_user_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReservation_book_fkey') THEN
    ALTER TABLE "P3LibraryReservation" ADD CONSTRAINT "P3LibraryReservation_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReservation_student_fkey') THEN
    ALTER TABLE "P3LibraryReservation" ADD CONSTRAINT "P3LibraryReservation_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryReservation_user_fkey') THEN
    ALTER TABLE "P3LibraryReservation" ADD CONSTRAINT "P3LibraryReservation_user_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryResourceAssignment_book_fkey') THEN
    ALTER TABLE "P3LibraryResourceAssignment" ADD CONSTRAINT "P3LibraryResourceAssignment_book_fkey" FOREIGN KEY ("bookId","schoolId") REFERENCES "P3LibraryBook"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryResourceAssignment_class_fkey') THEN
    ALTER TABLE "P3LibraryResourceAssignment" ADD CONSTRAINT "P3LibraryResourceAssignment_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryResourceAssignment_student_fkey') THEN
    ALTER TABLE "P3LibraryResourceAssignment" ADD CONSTRAINT "P3LibraryResourceAssignment_student_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryResourceAssignment_subject_fkey') THEN
    ALTER TABLE "P3LibraryResourceAssignment" ADD CONSTRAINT "P3LibraryResourceAssignment_subject_fkey" FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='P3LibraryResourceAssignment_user_fkey') THEN
    ALTER TABLE "P3LibraryResourceAssignment" ADD CONSTRAINT "P3LibraryResourceAssignment_user_fkey" FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['P3LibraryCopy','P3LibraryReadingProgress','P3LibraryBookmark','P3LibraryFavourite','P3LibraryReservation','P3LibraryResourceAssignment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I USING ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), '''')) WITH CHECK ("schoolId" = NULLIF(current_setting(''app.current_school_id'', true), ''''))', t || '_tenant', t);
  END LOOP;
END $$;
