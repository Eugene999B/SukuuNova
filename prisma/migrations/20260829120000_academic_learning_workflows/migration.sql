CREATE TABLE "LessonPlan" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT,
  "title" TEXT NOT NULL,
  "objective" TEXT,
  "content" TEXT NOT NULL,
  "plannedDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonPlan_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonPlan_teacher_fkey" FOREIGN KEY ("teacherId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonPlan_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonPlan_subject_fkey" FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonPlan_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LessonPlan_school_teacher_idx" ON "LessonPlan"("schoolId","teacherId");
CREATE INDEX "LessonPlan_school_status_idx" ON "LessonPlan"("schoolId","status");
CREATE INDEX "LessonPlan_school_class_subject_idx" ON "LessonPlan"("schoolId","classId","subjectId");
CREATE INDEX "LessonPlan_school_planned_idx" ON "LessonPlan"("schoolId","plannedDate");

CREATE TABLE "Homework" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "points" DECIMAL(10,2),
  "assignmentStatus" TEXT NOT NULL DEFAULT 'draft',
  "reviewStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Homework_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Homework_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Homework_teacher_fkey" FOREIGN KEY ("teacherId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Homework_class_fkey" FOREIGN KEY ("classId","schoolId") REFERENCES "Class"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Homework_subject_fkey" FOREIGN KEY ("subjectId","schoolId") REFERENCES "Subject"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Homework_term_fkey" FOREIGN KEY ("termId","schoolId") REFERENCES "Term"("id","schoolId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Homework_school_teacher_idx" ON "Homework"("schoolId","teacherId");
CREATE INDEX "Homework_school_status_idx" ON "Homework"("schoolId","assignmentStatus","reviewStatus");
CREATE INDEX "Homework_school_class_subject_idx" ON "Homework"("schoolId","classId","subjectId");
CREATE INDEX "Homework_school_due_idx" ON "Homework"("schoolId","dueDate");
