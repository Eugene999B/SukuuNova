import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { linkGuardianToStudent, makePrimaryGuardianForStudent } from "../src/lib/guardian-service";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

describe("guardian primary selection", () => {
  it("switches primary guardian atomically without creating two primaries", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({
        data: { schoolId: fixture.schoolId, admissionNo: `GP-${createId()}`, name: "Primary Switch Learner", status: "active" },
      });
      const first = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "First Guardian", phone: `050${Date.now()}` },
      });
      const second = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Second Guardian", phone: `051${Date.now()}` },
      });

      expect(await linkGuardianToStudent(tx, { schoolId: fixture.schoolId, studentId: student.id, guardianId: first.id, relationship: "Parent" })).toEqual({ isPrimary: true });
      expect(await linkGuardianToStudent(tx, { schoolId: fixture.schoolId, studentId: student.id, guardianId: second.id, relationship: "Guardian" })).toEqual({ isPrimary: false });

      await expect(makePrimaryGuardianForStudent(tx, { schoolId: fixture.schoolId, studentId: student.id, guardianId: second.id })).resolves.toMatchObject({ changed: true });

      const links = await tx.studentGuardian.findMany({
        where: { schoolId: fixture.schoolId, studentId: student.id },
        orderBy: { guardianId: "asc" },
      });
      expect(links.filter((link) => link.isPrimary)).toHaveLength(1);
      expect(links.find((link) => link.isPrimary)?.guardianId).toBe(second.id);
    });
  });
});
