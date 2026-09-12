CREATE TABLE "ClassHodAssignment" (
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassHodAssignment_pkey" PRIMARY KEY ("schoolId","classId","userId")
);

CREATE INDEX "ClassHodAssignment_schoolId_userId_idx" ON "ClassHodAssignment"("schoolId","userId");
CREATE INDEX "ClassHodAssignment_schoolId_classId_idx" ON "ClassHodAssignment"("schoolId","classId");

ALTER TABLE "ClassHodAssignment"
  ADD CONSTRAINT "ClassHodAssignment_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassHodAssignment"
  ADD CONSTRAINT "ClassHodAssignment_class_fkey"
  FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassHodAssignment"
  ADD CONSTRAINT "ClassHodAssignment_user_fkey"
  FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassHodAssignment"
  ADD CONSTRAINT "ClassHodAssignment_creator_fkey"
  FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SubjectHodAssignment" (
  "schoolId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubjectHodAssignment_pkey" PRIMARY KEY ("schoolId","subjectId","userId")
);

CREATE INDEX "SubjectHodAssignment_schoolId_userId_idx" ON "SubjectHodAssignment"("schoolId","userId");
CREATE INDEX "SubjectHodAssignment_schoolId_subjectId_idx" ON "SubjectHodAssignment"("schoolId","subjectId");

ALTER TABLE "SubjectHodAssignment"
  ADD CONSTRAINT "SubjectHodAssignment_school_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubjectHodAssignment"
  ADD CONSTRAINT "SubjectHodAssignment_subject_fkey"
  FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectHodAssignment"
  ADD CONSTRAINT "SubjectHodAssignment_user_fkey"
  FOREIGN KEY ("userId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectHodAssignment"
  ADD CONSTRAINT "SubjectHodAssignment_creator_fkey"
  FOREIGN KEY ("createdBy","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
