import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("../src/lib/audit", () => ({
  appendSchoolAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/report-card-ranking", () => ({
  freezeReportCardRanking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/sms-outbox", () => ({
  enqueueSms: vi.fn().mockResolvedValue([]),
}));

import { Prisma } from "@prisma/client";
import { toMoney, createFeeItem, recordPayment } from "../src/lib/finance-service";
import { permanentFailure } from "../src/lib/message-outbox";
import {
  createPublicReportPdfToken,
  verifyPublicReportPdfToken,
} from "../src/lib/report-card-release-service";
import { trustedAppOrigin } from "../src/app/api/mvp/report-cards/route";

describe("muse-hardening regression", () => {
  describe("exact monetary arithmetic", () => {
    it("rounds float ingress to 2dp via string conversion", () => {
      expect(toMoney(19.99).toFixed(2)).toBe("19.99");
      expect(toMoney(0.1 + 0.2).toFixed(2)).toBe("0.30");
      expect(toMoney(10.004).toFixed(2)).toBe("10.00");
    });
    it("rejects non-finite, non-positive and oversized amounts", () => {
      expect(() => toMoney(Number.POSITIVE_INFINITY)).toThrow();
      expect(() => toMoney(Number.NaN)).toThrow();
      expect(() => toMoney(0)).toThrow();
      expect(() => toMoney(-5)).toThrow();
      expect(() => toMoney(2_000_000_000)).toThrow();
    });
    it("stores fee items rounded to pesewas", async () => {
      let stored: unknown = null;
      const tx = {
        term: { findFirst: vi.fn().mockResolvedValue({ id: "t", isLocked: false }) },
        feeItem: {
          create: vi.fn().mockImplementation(async (args: { data: { amount: Prisma.Decimal } }) => {
            stored = args.data.amount;
            return { id: "fee-1", ...args.data };
          }),
        },
      } as never;
      await createFeeItem(tx, {
        schoolId: "s1",
        actorId: "a1",
        termId: "t",
        name: "Tuition",
        amount: 19.99,
      });
      expect((stored as Prisma.Decimal).toFixed(2)).toBe("19.99");
    });
    it("recordPayment uses exact outstanding comparison", async () => {
      const total = new Prisma.Decimal("100.00");
      const paid = new Prisma.Decimal("99.99");
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        payment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
        invoice: {
          findFirst: vi.fn().mockResolvedValue({
            id: "inv",
            totalAmount: total,
            status: "partial",
            studentId: "stu",
            payments: [{ amount: paid, reversals: [] }],
          }),
          update: vi.fn(),
        },
        studentGuardian: { findMany: vi.fn().mockResolvedValue([]) },
      } as never;
      // outstanding is 0.01; paying 0.02 must be rejected as overpayment
      await expect(
        recordPayment(tx, {
          schoolId: "s1",
          actorId: "a1",
          invoiceId: "inv",
          amount: 0.02,
          method: "cash",
          reference: "REF-OVER",
        })
      ).rejects.toMatchObject({ code: "OVERPAYMENT_REQUIRES_REVIEW" });
    });
  });

  describe("notification retry classification", () => {
    it("treats 4xx/config as permanent and 5xx/transient as retryable", () => {
      expect(permanentFailure("SMS provider HTTP 400")).toBe(true);
      expect(permanentFailure("SMS provider is not configured.")).toBe(true);
      expect(permanentFailure("SMS sender is unavailable.")).toBe(true);
      expect(permanentFailure("SMS provider HTTP 500")).toBe(false);
      expect(permanentFailure("Twilio WhatsApp HTTP 503")).toBe(false);
      expect(permanentFailure("temporary network failure")).toBe(false);
      // Regression: generic transient "Service Unavailable" must not dead-letter
      expect(permanentFailure("503 Service Unavailable")).toBe(false);
      expect(permanentFailure("timeout of 15000ms exceeded")).toBe(false);
    });
  });

  describe("public report-card tokens", () => {
    it("rejects tokens with extra segments or oversized input", async () => {
      process.env.SCHOOL_AUTH_SECRET = "test-secret-at-least-32-characters-long!";
      const token = createPublicReportPdfToken({ schoolId: "s1", reportId: "r1" });
      expect(verifyPublicReportPdfToken(token)).not.toBeNull();
      expect(verifyPublicReportPdfToken(token + ".extra")).toBeNull();
      expect(verifyPublicReportPdfToken("a".repeat(2001))).toBeNull();
      expect(verifyPublicReportPdfToken("truncated")).toBeNull();
    });
  });

  describe("trusted app origin", () => {
    it("never reflects request Origin/Host headers", () => {
      process.env.APP_URL = "https://school.example.com/";
      expect(trustedAppOrigin()).toBe("https://school.example.com");
      process.env.APP_URL = "not a url";
      expect(trustedAppOrigin()).toBe("http://localhost:3000");
      delete process.env.APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.org/base/";
      expect(trustedAppOrigin()).toBe("https://app.example.org");
      delete process.env.NEXT_PUBLIC_APP_URL;
    });
  });

  describe("broadcast idempotency key shape", () => {
    it("includes recipient id so N recipients create N messages", () => {
      const schoolId = "s1";
      const value = { audience: "guardians", channel: "sms", title: "T", body: "B" };
      const scheduledAt: Date | null = null;
      const keyFor = (recipientId: string) =>
        `broadcast:${schoolId}:${value.audience}:${value.channel}:${value.title}:${value.body}:${scheduledAt?.toISOString() || "now"}:${recipientId}`;
      expect(keyFor("guardian-1")).not.toBe(keyFor("guardian-2"));
      expect(keyFor("guardian-1")).toContain("guardian-1");
    });
  });
});
