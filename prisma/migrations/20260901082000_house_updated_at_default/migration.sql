-- Ensure House rows can be created safely when updatedAt is omitted.
ALTER TABLE "House"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
