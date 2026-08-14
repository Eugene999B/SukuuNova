import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { AppError, ForbiddenError } from "../src/lib/errors";
import { decryptEmbeddingRef } from "../src/lib/face-crypto";
import { enrollFace } from "../src/lib/face-service";
import type { FaceProvider } from "../src/lib/face-provider";
import { addApprovedPickup, attemptPickup, reviewPickupRequest } from "../src/lib/pickup-service";
import { getVisiblePayslipPdf, visiblePayslips } from "../src/lib/payroll-service";
import {
  createCustomRole,
  customRoleBuilderData,
  updateCustomRole
} from "../src/lib/role-builder-service";
import {
  confirmSubstitute,
  createTimetableSlot,
  suggestSubstitutes
} from "../src/lib/timetable-service";
import { createTenantFixture, type Fixture } from "./helpers";

describe("Phase 2 differentiator safety gates", () => {
  let fixture: Fixture;
  let other: Fixture;
  let studentId: string;
  let guardianId: string;
  let unlinkedGuardianId: string;
  let staffId: string;
  let otherStaffId: string;
  let classId: string;
  let otherClassId: string;
  let subjectId: string;

  beforeAll(async () => {
    process.env.FACE_EMBEDDING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    fixture = await createTenantFixture();
    other = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: {
          expectedResumptionTime: "08:00",
          timezone: "Africa/Accra",
          substituteLateMinutes: 20
        }
      });
      for (const permission of ["attendance:record", "attendance:pickup_approve", "payroll:view_own"] as const) {
        await tx.userPermissionOverride.create({
          data: {
            schoolId: fixture.schoolId,
            userId: fixture.memberId,
            permissionId: fixture.permissionIds.get(permission)!,
            granted: true
          }
        });
      }

      staffId = (await tx.user.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Phase 2 Staff",
          email: "phase2-staff-" + fixture.schoolId + "@test.invalid",
          passwordHash: "test-only"
        }
      })).id;
      otherStaffId = (await tx.user.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Other Phase 2 Staff",
          email: "other-phase2-staff-" + fixture.schoolId + "@test.invalid",
          passwordHash: "test-only"
        }
      })).id;
      for (const userId of [staffId, otherStaffId]) {
        await tx.userPermissionOverride.create({
          data: {
            schoolId: fixture.schoolId,
            userId,
            permissionId: fixture.permissionIds.get("payroll:view_own")!,
            granted: true
          }
        });
      }

      classId = (await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Phase 2 Class " + fixture.schoolId }
      })).id;
      otherClassId = (await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Phase 2 Other Class " + fixture.schoolId }
      })).id;
      subjectId = (await tx.subject.create({
        data: { schoolId: fixture.schoolId, name: "Phase 2 Subject " + fixture.schoolId }
      })).id;
      studentId = (await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "P2-" + fixture.schoolId,
          name: "Phase 2 Student",
          classId
        }
      })).id;
      guardianId = (await tx.guardian.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Consenting Guardian",
          phone: "+233240" + fixture.schoolId.slice(-6)
        }
      })).id;
      unlinkedGuardianId = (await tx.guardian.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Unlinked Guardian",
          phone: "+233250" + fixture.schoolId.slice(-6)
        }
      })).id;
      await tx.studentGuardian.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          guardianId,
          relationship: "Parent",
          isPrimary: true
        }
      });
    });
  });

  it("requires linked guardian consent and encrypts the provider face reference", async () => {
    const provider: FaceProvider = {
      async indexFace() { return { faceId: "provider-face-id-must-not-be-plain" }; },
      async searchFace() { return {}; }
    };
    const image = Buffer.alloc(256, 7).toString("base64");

    await withTenant(fixture.schoolId, async (tx) => {
      await expect(enrollFace(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId, consentByGuardianId: unlinkedGuardianId },
        image
      }, provider)).rejects.toMatchObject<Partial<AppError>>({
        code: "FACE_CONSENT_REQUIRED"
      });

      const result = await enrollFace(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId, consentByGuardianId: guardianId },
        image
      }, provider);
      const stored = await tx.faceEnrollment.findUnique({ where: { id: result.id } });
      expect(stored?.embeddingRef).not.toContain("provider-face-id-must-not-be-plain");
      expect(decryptEmbeddingRef(stored!.embeddingRef)).toBe("provider-face-id-must-not-be-plain");
      expect(stored?.consentByGuardianId).toBe(guardianId);
    });
  });

  it("never logs an unapproved pickup until a different authorized user approves it", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const attempted = await attemptPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        studentId,
        guardianId: unlinkedGuardianId
      });
      expect(attempted.status).toBe("approval_required");
      expect(await tx.pickupEvent.count({
        where: { studentId, collectedByGuardianId: unlinkedGuardianId }
      })).toBe(0);

      await expect(reviewPickupRequest(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        requestId: attempted.request.id,
        decision: "approved"
      })).rejects.toMatchObject<Partial<ForbiddenError>>({ status: 403 });

      await reviewPickupRequest(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        requestId: attempted.request.id,
        decision: "approved"
      });
      expect(await tx.pickupEvent.count({
        where: { studentId, collectedByGuardianId: unlinkedGuardianId }
      })).toBe(1);

      await addApprovedPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId,
        guardianId
      });
      await expect(attemptPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        studentId,
        guardianId
      })).resolves.toMatchObject({ status: "completed" });
    });
  });

  it("scopes staff payslip lists and guessed PDF IDs to the signed-in staff member", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const run = await tx.payrollRun.create({
        data: { schoolId: fixture.schoolId, period: "2026-08" }
      });
      const own = await tx.payslip.create({
        data: {
          schoolId: fixture.schoolId,
          payrollRunId: run.id,
          staffId,
          gross: 2000,
          deductions: [],
          net: 2000,
          pdfData: Buffer.from("own-payslip")
        }
      });
      const someoneElses = await tx.payslip.create({
        data: {
          schoolId: fixture.schoolId,
          payrollRunId: run.id,
          staffId: otherStaffId,
          gross: 3000,
          deductions: [],
          net: 3000,
          pdfData: Buffer.from("other-payslip")
        }
      });

      const visible = await visiblePayslips(tx, staffId);
      expect(visible.map((row) => row.id)).toEqual([own.id]);
      await expect(getVisiblePayslipPdf(tx, {
        actorId: staffId,
        payslipId: someoneElses.id
      })).rejects.toMatchObject<Partial<ForbiddenError>>({ status: 403 });
    });
  });

  it("keeps custom roles inside one tenant even when another tenant guesses the ID", async () => {
    const role = await withTenant(fixture.schoolId, (tx) => createCustomRole(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      name: "Safety Reviewer",
      permissionKeys: ["attendance:record", "visitors:log"]
    }));

    await withTenant(other.schoolId, async (tx) => {
      const data = await customRoleBuilderData(tx, other.ownerId);
      expect(data.roles.some((row) => row.id === role.id)).toBe(false);
      await expect(updateCustomRole(tx, {
        schoolId: other.schoolId,
        actorId: other.ownerId,
        roleId: role.id,
        name: "Cross-tenant attempt",
        permissionKeys: []
      })).rejects.toMatchObject<Partial<AppError>>({ status: 404 });
    });
  });

  it("suggests substitutes without writing an assignment until explicit confirmation", async () => {
    const day = new Date("2026-08-17T00:00:00.000Z");
    await withTenant(fixture.schoolId, async (tx) => {
      const absentSlot = await createTimetableSlot(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        classId,
        subjectId,
        teacherId: staffId,
        dayOfWeek: 1,
        period: 1
      });
      await createTimetableSlot(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        classId: otherClassId,
        subjectId,
        teacherId: otherStaffId,
        dayOfWeek: 2,
        period: 2
      });

      const result = await suggestSubstitutes(tx, {
        actorId: fixture.ownerId,
        absentTeacherId: staffId,
        day,
        period: 1,
        asOf: new Date("2026-08-17T10:00:00.000Z")
      });
      expect(result.suggestions.map((row) => row.id)).toContain(otherStaffId);
      expect(await tx.substituteAssignment.count()).toBe(0);

      const confirmed = await confirmSubstitute(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        timetableSlotId: absentSlot.id,
        substituteTeacherId: otherStaffId,
        assignmentDate: day
      });
      expect(confirmed.substituteTeacherId).toBe(otherStaffId);
      expect(await tx.substituteAssignment.count()).toBe(1);
    });
  });
});
