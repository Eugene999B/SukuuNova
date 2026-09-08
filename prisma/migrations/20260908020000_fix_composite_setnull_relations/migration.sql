-- Prisma cannot safely apply SetNull to these tenant-scoped composite
-- relations because schoolId is part of the required foreign key. Keep the
-- tenant key immutable and require explicit application-level unassignment.
-- Install without scanning existing rows; the following migration validates it.
ALTER TABLE "Student" DROP CONSTRAINT "Student_houseId_schoolId_fkey";
ALTER TABLE "Student"
  ADD CONSTRAINT "Student_houseId_schoolId_fkey"
  FOREIGN KEY ("houseId", "schoolId")
  REFERENCES "House"("id", "schoolId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  NOT VALID;
