import { describe, expect, it } from "vitest";
import { enqueueNotification } from "../src/lib/message-outbox";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

describe("message enqueue idempotency", () => {
  it("returns the same queued message for the same logical event without charging twice", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","status","updatedAt") VALUES ($1,10,0,'active',CURRENT_TIMESTAMP)`, fixture.schoolId);
      const input = {
        schoolId: fixture.schoolId,
        recipientType: "guardian" as const,
        recipientId: fixture.memberId,
        recipientPhone: "+233240111222",
        body: "Payment received",
        templateKey: "payment_received" as const,
        templateVariables: { "1": "100.00", "2": "paid", "3": "invoice-1" },
        idempotencyKey: "payment-created:payment-1:v1",
        channels: "sms" as const,
      };

      const first = await enqueueNotification(tx, input);
      const second = await enqueueNotification(tx, input);

      expect(first).toHaveLength(1);
      expect(second[0]?.id).toBe(first[0]?.id);
      expect(await tx.message.count({ where: { schoolId: fixture.schoolId, idempotencyKey: { contains: "payment-created:payment-1:v1" } } })).toBe(1);
      const wallet = await tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(`SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`, fixture.schoolId);
      expect(wallet[0]?.smsBalance).toBe(9);
    });
  });
});
