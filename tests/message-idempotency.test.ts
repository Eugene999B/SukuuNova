import { describe, expect, it } from "vitest";
import { enqueueNotification } from "../src/lib/message-outbox";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

describe("message enqueue idempotency", () => {
  it("returns the same queued message for the same logical event", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      const input = {
        schoolId: fixture.schoolId,
        recipientType: "guardian" as const,
        recipientId: fixture.memberId,
        recipientPhone: "+233240111222",
        body: "Payment received",
        templateKey: "payment_received" as const,
        templateVariables: { "1": "100.00", "2": "paid", "3": "invoice-1" },
        idempotencyKey: "payment-created:payment-1:v1"
      };

      const first = await enqueueNotification(tx, input);
      const second = await enqueueNotification(tx, input);

      expect(first).toHaveLength(1);
      expect(second[0]?.id).toBe(first[0]?.id);
      expect(await tx.message.count({ where: { schoolId: fixture.schoolId, idempotencyKey: { contains: "payment-created:payment-1:v1" } } })).toBe(1);
    });
  });
});
