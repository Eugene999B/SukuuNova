-- Staff identity-card portraits. Stored using the same school-controlled photo representation as learner profiles.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

-- Keep the field bounded enough to reject accidental massive payloads while allowing camera data URLs.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_photoUrl_length_check";
ALTER TABLE "User" ADD CONSTRAINT "User_photoUrl_length_check"
  CHECK ("photoUrl" IS NULL OR char_length("photoUrl") <= 3000000);
