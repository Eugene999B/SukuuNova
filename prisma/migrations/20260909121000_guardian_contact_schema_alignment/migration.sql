-- Guardian.phone is optional in the Prisma model; preserve email-only/contact-pending records.
ALTER TABLE "Guardian" ALTER COLUMN "phone" DROP NOT NULL;
