-- Production-safe reconciliation for databases where the academic learning
-- workflow migration was marked applied but the physical tables are missing.
-- Never removes or replaces existing data. Existing tables are left untouched.

CREATE TABLE IF NOT EXISTS "LessonPlan" (
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
CREATE INDEX IF NOT EXISTS "LessonPlan_school_teacher_idx" ON "LessonPlan"("schoolId","teacherId");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_status_idx" ON "LessonPlan"("schoolId","status");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_class_subject_idx" ON "LessonPlan"("schoolId","classId","subjectId");
CREATE INDEX IF NOT EXISTS "LessonPlan_school_planned_idx" ON "LessonPlan"("schoolId","plannedDate");

CREATE TABLE IF NOT EXISTS "Homework" (
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
CREATE INDEX IF NOT EXISTS "Homework_school_teacher_idx" ON "Homework"("schoolId","teacherId");
CREATE INDEX IF NOT EXISTS "Homework_school_status_idx" ON "Homework"("schoolId","assignmentStatus","reviewStatus");
CREATE INDEX IF NOT EXISTS "Homework_school_class_subject_idx" ON "Homework"("schoolId","classId","subjectId");
CREATE INDEX IF NOT EXISTS "Homework_school_due_idx" ON "Homework"("schoolId","dueDate");

-- Repair malformed/partial timetable configuration without overwriting valid
-- school-specific settings. Existing object keys override these defaults.
UPDATE "SchoolSettings"
SET "timetableConfig" =
  '{"days":[{"dayOfWeek":1,"name":"Monday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":2,"name":"Tuesday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":3,"name":"Wednesday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":4,"name":"Thursday","enabled":true,"start":"08:00","end":"15:00"},{"dayOfWeek":5,"name":"Friday","enabled":true,"start":"08:00","end":"14:00"}],"periodMinutes":40,"breaks":[{"name":"Break","start":"10:00","end":"10:20"},{"name":"Lunch","start":"12:20","end":"13:00"}],"periodsPerDay":8,"published":false}'::jsonb
  || COALESCE("timetableConfig", '{}'::jsonb)
WHERE "timetableConfig" IS NULL
   OR COALESCE(jsonb_typeof("timetableConfig"), 'null') <> 'object'
   OR COALESCE(jsonb_typeof("timetableConfig"->'days'), 'null') <> 'array'
   OR COALESCE(jsonb_typeof("timetableConfig"->'breaks'), 'null') <> 'array'
   OR COALESCE(jsonb_typeof("timetableConfig"->'periodsPerDay'), 'null') <> 'number';