import { describe, expect, it, vi } from "vitest";

const { requirePermission } = vi.hoisted(() => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/rbac", () => ({
  requirePermission,
  hasPermission: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/lib/audit", () => ({
  appendSchoolAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/report-card-ranking", () => ({
  freezeReportCardRanking: vi.fn().mockResolvedValue(undefined),
}));

import { setSalaryStructure } from "../src/lib/payroll-service";
import { getAcademicEngineConfig } from "../src/lib/academic-engine";
import { approveAndQueuePublicReportCard } from "../src/lib/report-card-release-service";
import type { TenantDb } from "../src/lib/db";

describe("Hardening Invariants", () => {
  describe("Payroll deduction validation", () => {
    it("rejects salary structure when cumulative deductions exceed gross salary", async () => {
      const tx = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: "staff-1" }) },
        salaryStructure: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn(),
        },
      } as unknown as TenantDb;

      await expect(
        setSalaryStructure(tx, {
          schoolId: "school-1",
          actorId: "admin-1",
          staffId: "staff-1",
          grossSalary: 1000,
          deductions: [
            { label: "Tax", type: "percent", value: 60 },
            { label: "Loan", type: "percent", value: 50 },
          ],
        })
      ).rejects.toMatchObject({ code: "TOTAL_DEDUCTIONS_EXCEED_GROSS" });
    });

    it("rejects salary structure when percentage deduction exceeds 100%", async () => {
      const tx = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: "staff-1" }) },
      } as unknown as TenantDb;

      await expect(
        setSalaryStructure(tx, {
          schoolId: "school-1",
          actorId: "admin-1",
          staffId: "staff-1",
          grossSalary: 1000,
          deductions: [{ label: "Overkill", type: "percent", value: 105 }],
        })
      ).rejects.toMatchObject({ code: "INVALID_DEDUCTION" });
    });

    it("accepts valid salary structure within gross salary", async () => {
      const mockStructure = {
        id: "struct-1",
        schoolId: "school-1",
        staffId: "staff-1",
        grossSalary: 2000,
        deductions: [],
      };
      const tx = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: "staff-1" }) },
        salaryStructure: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue(mockStructure),
        },
      } as unknown as TenantDb;

      const result = await setSalaryStructure(tx, {
        schoolId: "school-1",
        actorId: "admin-1",
        staffId: "staff-1",
        grossSalary: 2000,
        deductions: [
          { label: "SSNIT", type: "percent", value: 5.5 },
          { label: "Welfare", type: "fixed", value: 50 },
        ],
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("struct-1");
    });
  });

  describe("Academic engine tenant isolation", () => {
    it("queries settings specifically scoped to the provided schoolId", async () => {
      const findUniqueMock = vi.fn().mockResolvedValue({
        timetableConfig: { periodMinutes: 45 },
        assessmentConfig: { categories: [{ name: "exam", weight: 100 }] },
        reportCardConfig: {},
      });

      const tx = {
        schoolSettings: {
          findUnique: findUniqueMock,
        },
      } as unknown as TenantDb;

      const config = await getAcademicEngineConfig(tx, "school-xyz");

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { schoolId: "school-xyz" },
        select: {
          timetableConfig: true,
          assessmentConfig: true,
          reportCardConfig: true,
        },
      });
      expect(config.timetable).toBeDefined();
      expect(config.assessment).toBeDefined();
    });
  });
  describe("Report card approval resilience", () => {
    it("approves report card even if guardian phone is missing for notification", async () => {
      const originalUrl = process.env.SMS_PROVIDER_URL;
      const originalToken = process.env.SMS_PROVIDER_TOKEN;
      const originalSecret = process.env.SCHOOL_AUTH_SECRET;
      process.env.SMS_PROVIDER_URL = "https://sms.example.com";
      process.env.SMS_PROVIDER_TOKEN = "secret-token";
      process.env.SCHOOL_AUTH_SECRET = "super-secret-key-at-least-32-characters-long";

      try {
        let currentStatus = "submitted";
        const tx = {
          reportCard: {
            findFirst: vi.fn().mockImplementation(async () => ({
              id: "rc-1",
              status: currentStatus,
              submittedBy: "teacher-1",
              studentId: "student-1",
              student: { name: "Kwame", guardians: [] },
              term: { name: "Term 1" },
            })),
            update: vi.fn().mockImplementation(async () => {
              currentStatus = "approved";
              return {
                id: "rc-1",
                status: "approved",
                approvedBy: "principal-1",
              };
            }),
          },
          schoolSettings: {
            findUnique: vi.fn().mockResolvedValue({
              notificationChannels: {
                channels: ["sms"],
                automation: { report_card_ready: true },
              },
              smsSenderId: "SukuuNova",
            }),
          },
          guardian: { findMany: vi.fn().mockResolvedValue([]) },
          studentGuardian: { findMany: vi.fn().mockResolvedValue([]) },
        } as unknown as TenantDb;

        const result = await approveAndQueuePublicReportCard(tx, {
          schoolId: "school-1",
          actorId: "principal-1",
          reportCardId: "rc-1",
          origin: "https://sukuu.example.com",
        });

        expect(result.status).toBe("approved");
        expect(result.notification.skipped).toBe(true);
        expect(result.notification.reason).toBe("NO_GUARDIAN_PHONE");
      } finally {
        process.env.SMS_PROVIDER_URL = originalUrl;
        process.env.SMS_PROVIDER_TOKEN = originalToken;
        process.env.SCHOOL_AUTH_SECRET = originalSecret;
      }
    });
  });

  describe("Webhook route middleware classification", () => {
    it("allows WhatsApp webhook path without requiring school session cookie", async () => {
      const { middleware } = await import("../src/middleware");
      const webhookRequest = {
        nextUrl: {
          pathname: "/api/phase4/whatsapp",
          search: "",
        },
        cookies: {
          get: () => undefined,
        },
        url: "http://localhost:3000/api/phase4/whatsapp",
        headers: new Headers(),
      };

      const webhookResponse = await middleware(webhookRequest as never);
      // Webhook route is not blocked by 401 Unauthorized
      expect(webhookResponse.status).not.toBe(401);

      // Verify that other phase4 endpoints require authentication (return 401)
      const protectedRequest = {
        nextUrl: {
          pathname: "/api/phase4/emergency",
          search: "",
        },
        cookies: {
          get: () => undefined,
        },
        url: "http://localhost:3000/api/phase4/emergency",
        headers: new Headers(),
      };

      const protectedResponse = await middleware(protectedRequest as never);
      expect(protectedResponse.status).toBe(401);
    });
  });
});
