-- SukuuNova school identity cards.
-- Additive migration: one tenant-owned credential per active student/staff member,
-- signed public verification, revocation/expiry support, and print-pack metadata.

CREATE TABLE "IdentityCard" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "personType" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "serial" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityCard_personType_check" CHECK ("personType" IN ('student', 'staff')),
  CONSTRAINT "IdentityCard_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "IdentityCard_identity_check" CHECK (
    ("personType" = 'student' AND "studentId" IS NOT NULL AND "staffId" IS NULL)
    OR
    ("personType" = 'staff' AND "staffId" IS NOT NULL AND "studentId" IS NULL)
  ),
  CONSTRAINT "IdentityCard_student_school_fkey"
    FOREIGN KEY ("studentId", "schoolId")
    REFERENCES "Student" ("id", "schoolId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT "IdentityCard_staff_school_fkey"
    FOREIGN KEY ("staffId", "schoolId")
    REFERENCES "User" ("id", "schoolId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT "IdentityCard_school_fkey"
    FOREIGN KEY ("schoolId")
    REFERENCES "School" ("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IdentityCard_serial_key" ON "IdentityCard" ("serial");
CREATE UNIQUE INDEX "IdentityCard_active_student_key"
  ON "IdentityCard" ("schoolId", "studentId")
  WHERE "personType" = 'student' AND "status" = 'active' AND "studentId" IS NOT NULL;
CREATE UNIQUE INDEX "IdentityCard_active_staff_key"
  ON "IdentityCard" ("schoolId", "staffId")
  WHERE "personType" = 'staff' AND "status" = 'active' AND "staffId" IS NOT NULL;
CREATE INDEX "IdentityCard_school_person_status_idx"
  ON "IdentityCard" ("schoolId", "personType", "status");
CREATE INDEX "IdentityCard_school_serial_idx"
  ON "IdentityCard" ("schoolId", "serial");
CREATE INDEX "IdentityCard_school_expiry_idx"
  ON "IdentityCard" ("schoolId", "expiresAt");

ALTER TABLE "IdentityCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityCard" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IdentityCard_tenant_isolation"
  ON "IdentityCard"
  USING ("schoolId" = sukuunova_current_school_id())
  WITH CHECK ("schoolId" = sukuunova_current_school_id());
