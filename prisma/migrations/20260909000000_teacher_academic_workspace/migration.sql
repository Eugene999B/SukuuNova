CREATE TABLE IF NOT EXISTS "TeacherAcademicWork" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "workDate" DATE NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "workNumber" INTEGER NOT NULL DEFAULT 1,
  "maxScore" DECIMAL(12,2) NOT NULL DEFAULT 10,
  "markingMode" TEXT NOT NULL DEFAULT 'manual',
  "answerGuide" JSONB,
  "dueAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicWork_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherAcademicWork_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicWork_term_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicWork_class_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicWork_subject_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicWork_teacher_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicWork_id_schoolId_key" ON "TeacherAcademicWork"("id","schoolId");
CREATE INDEX IF NOT EXISTS "TeacherAcademicWork_teacher_context_idx" ON "TeacherAcademicWork"("schoolId","teacherId","classId","subjectId","termId");
CREATE INDEX IF NOT EXISTS "TeacherAcademicWork_week_idx" ON "TeacherAcademicWork"("schoolId","classId","subjectId","termId","weekNumber","workNumber");

CREATE TABLE IF NOT EXISTS "TeacherAcademicQuestion" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "points" DECIMAL(12,2) NOT NULL DEFAULT 1,
  "options" JSONB,
  "acceptedAnswers" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherAcademicQuestion_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicQuestion_work_fkey" FOREIGN KEY ("workId") REFERENCES "TeacherAcademicWork"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicQuestion_id_schoolId_key" ON "TeacherAcademicQuestion"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicQuestion_work_position_key" ON "TeacherAcademicQuestion"("workId","position");

CREATE TABLE IF NOT EXISTS "TeacherAcademicSubmission" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ,
  "submittedAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "totalAwarded" DECIMAL(12,2),
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherAcademicSubmission_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicSubmission_work_fkey" FOREIGN KEY ("workId") REFERENCES "TeacherAcademicWork"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicSubmission_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicSubmission_reviewer_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicSubmission_id_schoolId_key" ON "TeacherAcademicSubmission"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicSubmission_work_student_key" ON "TeacherAcademicSubmission"("workId","studentId");
CREATE INDEX IF NOT EXISTS "TeacherAcademicSubmission_work_status_idx" ON "TeacherAcademicSubmission"("schoolId","workId","status");

CREATE TABLE IF NOT EXISTS "TeacherAcademicAnswer" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "responseText" TEXT,
  "responseData" JSONB,
  "awardedScore" DECIMAL(12,2),
  "markingMode" TEXT,
  "markerComment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherAcademicAnswer_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicAnswer_submission_fkey" FOREIGN KEY ("submissionId") REFERENCES "TeacherAcademicSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicAnswer_question_fkey" FOREIGN KEY ("questionId") REFERENCES "TeacherAcademicQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicAnswer_id_schoolId_key" ON "TeacherAcademicAnswer"("id","schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicAnswer_submission_question_key" ON "TeacherAcademicAnswer"("submissionId","questionId");

CREATE TABLE IF NOT EXISTS "TeacherAcademicNote" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "weekNumber" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeacherAcademicNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherAcademicNote_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicNote_term_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicNote_class_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicNote_subject_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherAcademicNote_teacher_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAcademicNote_id_schoolId_key" ON "TeacherAcademicNote"("id","schoolId");
CREATE INDEX IF NOT EXISTS "TeacherAcademicNote_context_idx" ON "TeacherAcademicNote"("schoolId","classId","subjectId","termId","status");
