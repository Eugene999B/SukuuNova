CREATE TABLE "ArcadeRound" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "game" TEXT NOT NULL CHECK ("game" IN ('math','word','logic')),
  "difficulty" INTEGER NOT NULL CHECK ("difficulty" BETWEEN 1 AND 4),
  "questions" JSONB NOT NULL CHECK (jsonb_typeof("questions")='array' AND jsonb_array_length("questions")=5),
  "answers" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("answers")='array'),
  "status" TEXT NOT NULL DEFAULT 'in_progress' CHECK ("status" IN ('in_progress','completed')),
  "correct" INTEGER NOT NULL DEFAULT 0 CHECK ("correct" BETWEEN 0 AND 5),
  "xp" INTEGER NOT NULL DEFAULT 0 CHECK ("xp" BETWEEN 0 AND 50),
  "stars" INTEGER NOT NULL DEFAULT 0 CHECK ("stars" BETWEEN 0 AND 3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "localDate" TEXT,
  CONSTRAINT "ArcadeRound_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArcadeRound_studentId_schoolId_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArcadeRound_completion_check" CHECK (("status"='in_progress' AND "completedAt" IS NULL AND "localDate" IS NULL AND "xp"=0 AND "stars"=0 AND "correct"=0) OR ("status"='completed' AND "completedAt" IS NOT NULL AND "localDate" IS NOT NULL))
);
CREATE UNIQUE INDEX "ArcadeRound_id_schoolId_key" ON "ArcadeRound"("id","schoolId");
CREATE INDEX "ArcadeRound_schoolId_studentId_completedAt_idx" ON "ArcadeRound"("schoolId","studentId","completedAt");
CREATE UNIQUE INDEX "ArcadeRound_active_game_key" ON "ArcadeRound"("schoolId","studentId","game") WHERE "status"='in_progress';
ALTER TABLE "ArcadeRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeRound" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_tenant" ON "ArcadeRound" USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),'')) WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));
