import { describe, expect, it, vi } from "vitest";
import { calculateSmsCredits, dispatchSmsBatch, normalizeSmsPhone, normalizeSmsPhoneList, schoolSmsBody } from "../src/lib/platform-sms-center-service";

describe("Platform SMS Control Center helpers", () => {
  it("normalizes Ghana local and international phone numbers", () => {
    expect(normalizeSmsPhone("024 123 4567")).toBe("+233241234567");
    expect(normalizeSmsPhone("233241234567")).toBe("+233241234567");
    expect(normalizeSmsPhone("00233241234567")).toBe("+233241234567");
    expect(normalizeSmsPhone("+447700900123")).toBe("+447700900123");
    expect(normalizeSmsPhone("not-a-phone")).toBeNull();
  });

  it("deduplicates recipients after normalization", () => {
    expect(normalizeSmsPhoneList("0241234567, +233241234567; 0201234567\ninvalid")).toEqual([
      "+233241234567",
      "+233201234567",
    ]);
  });

  it("includes the school identity in the exact segment preview", () => {
    expect(schoolSmsBody("Eugene Academy", "PTA meeting tomorrow")).toBe("Eugene Academy: PTA meeting tomorrow");
    expect(schoolSmsBody("Eugene Academy", "Eugene Academy: PTA meeting tomorrow")).toBe("Eugene Academy: PTA meeting tomorrow");
    expect(calculateSmsCredits("A".repeat(161), 4)).toMatchObject({ segments: 2, recipients: 4, totalCredits: 8 });
  });

  it("dispatches through an injected mock sender and never needs a live SMS provider", async () => {
    const sender = vi.fn(async ({ phone }: { phone: string; body: string }) => {
      if (phone.endsWith("002")) throw new Error("mock provider failure");
      return { providerKey: "arkesel" as const, providerMessageId: `mock-${phone.slice(-3)}`, creditsUsed: 1 };
    });
    const results = await dispatchSmsBatch(["+233240000001", "+233240000002"], "Test only", sender);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ ok: true, providerKey: "arkesel", providerMessageId: "mock-001" });
    expect(results[1]).toMatchObject({ ok: false, error: "mock provider failure" });
  });
});
