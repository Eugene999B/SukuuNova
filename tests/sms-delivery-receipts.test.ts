import { describe, expect, it } from "vitest";
import { describeSmsDeliveryStatus, normalizeSmsProviderDeliveryStatus } from "../src/lib/sms-delivery-receipts";

describe("SMS provider delivery receipts", () => {
  it("normalizes only documented provider lifecycle states", () => {
    expect(normalizeSmsProviderDeliveryStatus("delivered")).toBe("DELIVERED");
    expect(normalizeSmsProviderDeliveryStatus("not-delivered")).toBe("NOT_DELIVERED");
    expect(normalizeSmsProviderDeliveryStatus("submitted")).toBe("SUBMITTED");
    expect(normalizeSmsProviderDeliveryStatus("unknown")).toBeNull();
  });

  it("does not confuse provider acceptance with handset delivery", () => {
    expect(describeSmsDeliveryStatus("SUBMITTED")).toMatchObject({ status: "submitted", group: "in_transit", label: "Submitted / accepted" });
    expect(describeSmsDeliveryStatus("sent")).toMatchObject({ status: "submitted", group: "in_transit" });
    expect(describeSmsDeliveryStatus("DELIVERED")).toMatchObject({ status: "delivered", group: "delivered", label: "Delivered" });
  });

  it("groups terminal delivery failures separately", () => {
    expect(describeSmsDeliveryStatus("NOT_DELIVERED").group).toBe("failed");
    expect(describeSmsDeliveryStatus("PROHIBITED").group).toBe("failed");
    expect(describeSmsDeliveryStatus("EXPIRED").group).toBe("failed");
    expect(describeSmsDeliveryStatus("SEND_FAILED").group).toBe("failed");
  });
});
