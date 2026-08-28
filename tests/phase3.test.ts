import { describe, expect, it, vi } from "vitest";
import { createSchoolUser } from "@/lib/school-services";
import {
  calculateEffectiveInvoiceTotal,
  canSyncOfflineEntity,
  createStaffFromApplicant,
  enforceExamDeadline,
  offlineDecision,
  offlinePermissionFor
} from "@/lib/phase3-service";

vi.mock("@/lib/school-services", () => ({ createSchoolUser: vi.fn() }));

describe("SukuuNova Phase 3 invariants", () => {
  it("enforces CBT timeout on the server", () => {
    const expires = new Date("2026-08-28T10:00:00.000Z");
    expect(() => enforceExamDeadline(expires, new Date("2026-08-28T10:00:01.000Z"))).toThrowError(/expired/);
  });

  it("keeps a pending waiver out of the invoice reduction", () => {
    expect(calculateEffectiveInvoiceTotal(1000, [
      { status: "pending", mode: "amount", value: 400 },
      { status: "approved", mode: "amount", value: 100 }
    ])).toBe(900);
  });

  it("reuses the existing staff-user creation path for applicant conversion", async () => {
    const creator = vi.mocked(createSchoolUser);
    creator.mockResolvedValue({ id: "staff-1" } as never);
    await createStaffFromApplicant({ schoolId: "school-1", actorId: "admin-1", name: "Candidate", email: "candidate@example.com", password: "long-initial-password" });
    expect(creator).toHaveBeenCalledWith({ schoolId: "school-1", actorId: "admin-1", name: "Candidate", email: "candidate@example.com", phone: undefined, password: "long-initial-password" });
  });

  it("deduplicates an offline idempotency key", () => {
    expect(offlineDecision(null)).toBe("process");
    expect(offlineDecision("applied")).toBe("duplicate");
    expect(offlineDecision("rejected")).toBe("duplicate");
  });

  it("rejects offline sync after the permission is revoked", () => {
    expect(canSyncOfflineEntity("attendance", new Set(["attendance:record"]))).toBe(true);
    expect(canSyncOfflineEntity("attendance", new Set())).toBe(false);
  });

  it("allows only attendance and score offline entities", () => {
    expect(offlinePermissionFor("attendance")).toBe("attendance:record");
    expect(offlinePermissionFor("score", true)).toBe("scores:write:all");
    expect(() => offlinePermissionFor("invoice")).toThrowError(/attendance and score/);
  });
});
