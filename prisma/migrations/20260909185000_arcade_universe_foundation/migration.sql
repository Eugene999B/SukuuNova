-- Generalize Learning Arcade without rewriting historical rounds.
-- Existing math/word/logic rounds remain valid and readable.

ALTER TABLE "ArcadeRound"
  ADD COLUMN IF NOT EXISTS "ageBand" TEXT,
  ADD COLUMN IF NOT EXISTS "standardBand" TEXT,
  ADD COLUMN IF NOT EXISTS "engine" TEXT NOT NULL DEFAULT 'choice_quiz',
  ADD COLUMN IF NOT EXISTS "roundLength" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "challengeMode" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "settingsSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Remove the original three-game / five-question ceilings. Validation now uses
-- the versioned game registry + school settings before a round is created.
ALTER TABLE "ArcadeRound" DROP CONSTRAINT IF EXISTS "ArcadeRound_game_check";
ALTER TABLE "ArcadeRound" DROP CONSTRAINT IF EXISTS "ArcadeRound_difficulty_check";
ALTER TABLE "ArcadeRound" DROP CONSTRAINT IF EXISTS "ArcadeRound_questions_check";
ALTER TABLE "ArcadeRound" DROP CONSTRAINT IF EXISTS "ArcadeRound_correct_check";
ALTER TABLE "ArcadeRound" DROP CONSTRAINT IF EXISTS "ArcadeRound_xp_check";

ALTER TABLE "ArcadeRound"
  ADD CONSTRAINT "ArcadeRound_difficulty_check" CHECK ("difficulty" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ArcadeRound_questions_check" CHECK (jsonb_typeof("questions")='array' AND jsonb_array_length("questions") BETWEEN 1 AND 50),
  ADD CONSTRAINT "ArcadeRound_answers_check_v2" CHECK (jsonb_typeof("answers")='array'),
  ADD CONSTRAINT "ArcadeRound_roundLength_check" CHECK ("roundLength" BETWEEN 1 AND 50),
  ADD CONSTRAINT "ArcadeRound_question_length_check" CHECK (jsonb_array_length("questions")="roundLength"),
  ADD CONSTRAINT "ArcadeRound_correct_check" CHECK ("correct" BETWEEN 0 AND "roundLength"),
  ADD CONSTRAINT "ArcadeRound_xp_check" CHECK ("xp" BETWEEN 0 AND 100000),
  ADD CONSTRAINT "ArcadeRound_score_check" CHECK ("score" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "ArcadeRound_ageBand_check" CHECK ("ageBand" IS NULL OR "ageBand" IN ('age_4_5','age_6_8','age_9_11','age_12_14','age_15_18')),
  ADD CONSTRAINT "ArcadeRound_standardBand_check" CHECK ("standardBand" IS NULL OR "standardBand" IN ('kg','basic_1_3','basic_4_6','jhs','shs')),
  ADD CONSTRAINT "ArcadeRound_engine_check" CHECK ("engine" IN ('choice_quiz','rapid_fire','match_pairs','sort_sequence','classify_buckets','tile_builder','memory_flip','grid_hunt','path_choice','map_label','simulation','typed_response'));

CREATE INDEX IF NOT EXISTS "ArcadeRound_school_game_completed_score_idx"
  ON "ArcadeRound"("schoolId","game","completedAt","score" DESC)
  WHERE "status"='completed';
CREATE INDEX IF NOT EXISTS "ArcadeRound_school_game_standard_completed_idx"
  ON "ArcadeRound"("schoolId","game","standardBand","completedAt")
  WHERE "status"='completed';
CREATE INDEX IF NOT EXISTS "ArcadeRound_school_game_age_completed_idx"
  ON "ArcadeRound"("schoolId","game","ageBand","completedAt")
  WHERE "status"='completed';

CREATE TABLE "ArcadeGameSetting" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "gameKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowedAgeBands" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "allowedStandardBands" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "defaultRoundLength" INTEGER,
  "timedChallengesEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "dailyGuidanceRounds" INTEGER,
  "contentPackKeys" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcadeGameSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArcadeGameSetting_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArcadeGameSetting_age_json_check" CHECK (jsonb_typeof("allowedAgeBands")='array'),
  CONSTRAINT "ArcadeGameSetting_standard_json_check" CHECK (jsonb_typeof("allowedStandardBands")='array'),
  CONSTRAINT "ArcadeGameSetting_pack_json_check" CHECK (jsonb_typeof("contentPackKeys")='array'),
  CONSTRAINT "ArcadeGameSetting_round_length_check" CHECK ("defaultRoundLength" IS NULL OR "defaultRoundLength" BETWEEN 1 AND 50),
  CONSTRAINT "ArcadeGameSetting_daily_guidance_check" CHECK ("dailyGuidanceRounds" IS NULL OR "dailyGuidanceRounds" BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX "ArcadeGameSetting_id_schoolId_key" ON "ArcadeGameSetting"("id","schoolId");
CREATE UNIQUE INDEX "ArcadeGameSetting_school_game_key" ON "ArcadeGameSetting"("schoolId","gameKey");
CREATE INDEX "ArcadeGameSetting_school_enabled_idx" ON "ArcadeGameSetting"("schoolId","enabled");

ALTER TABLE "ArcadeGameSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ArcadeGameSetting_tenant" ON "ArcadeGameSetting"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));
