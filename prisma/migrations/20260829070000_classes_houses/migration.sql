CREATE TABLE "House" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "color" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "House_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "House_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "House_schoolId_name_key" ON "House"("schoolId", "name");
CREATE UNIQUE INDEX "House_schoolId_code_key" ON "House"("schoolId", "code");
CREATE INDEX "House_schoolId_idx" ON "House"("schoolId");

ALTER TABLE "Student" ADD COLUMN "houseId" TEXT;
CREATE INDEX "Student_schoolId_houseId_idx" ON "Student"("schoolId", "houseId");
ALTER TABLE "Student" ADD CONSTRAINT "Student_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE SET NULL ON UPDATE CASCADE;
