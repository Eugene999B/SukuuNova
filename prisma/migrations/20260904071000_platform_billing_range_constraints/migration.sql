DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformSchoolBillingConfig_maximum_check') THEN
    ALTER TABLE "PlatformSchoolBillingConfig"
      ADD CONSTRAINT "PlatformSchoolBillingConfig_maximum_check"
      CHECK ("maximumCharge" IS NULL OR ("maximumCharge" >= 0 AND "maximumCharge" >= "minimumCharge"));
  END IF;
END $$;
