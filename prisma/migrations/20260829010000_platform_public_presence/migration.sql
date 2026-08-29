CREATE TABLE "PlatformPublicSettings" (
  "id" TEXT NOT NULL,
  "brandName" TEXT NOT NULL DEFAULT 'SukuuNova',
  "tagline" TEXT NOT NULL DEFAULT 'A calmer, more connected way to run a school.',
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "whatsappNumber" TEXT,
  "tiktokHandle" TEXT,
  "instagramHandle" TEXT,
  "facebookHandle" TEXT,
  "linkedinHandle" TEXT,
  "youtubeHandle" TEXT,
  "xHandle" TEXT,
  "websiteUrl" TEXT,
  "showSocialLinks" BOOLEAN NOT NULL DEFAULT true,
  "showLeadChat" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformPublicSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicInquiry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'website',
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "assignedToAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repliedAt" TIMESTAMP(3),
  "repliedVia" TEXT,
  CONSTRAINT "PublicInquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicInquiry_admin_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PublicInquiry_status_createdAt_idx" ON "PublicInquiry"("status","createdAt");
CREATE INDEX "PublicInquiry_email_idx" ON "PublicInquiry"("email");
CREATE INDEX "PublicInquiry_phone_idx" ON "PublicInquiry"("phone");

INSERT INTO "PlatformPublicSettings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
