import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { enqueueNotification, processMessageBatchOnce } from "../src/lib/message-outbox";
import { createTenantFixture } from "./helpers";

async function setBalance(schoolId: string, balance: number) {
  await withTenant(schoolId, (tx) => tx.$executeRawUnsafe(
    `INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","status","updatedAt") VALUES ($1,$2,0,'active',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO UPDATE SET "smsBalance"=EXCLUDED."smsBalance","status"='active',"updatedAt"=CURRENT_TIMESTAMP`,
    schoolId,
    balance,
  ));
}

async function balance(schoolId: string) {
  return withTenant(schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ smsBalance: number }>>(`SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`, schoolId);
    return rows[0]?.smsBalance ?? 0;
  });
}

describe("permanent SMS delivery failure accounting", () => {
  it("returns reserved SMS segments exactly once when delivery permanently fails", async () => {
    const fixture = await createTenantFixture();
    await setBalance(fixture.schoolId, 10);

    const [message] = await withTenant(fixture.schoolId, (tx) => enqueueNotification(tx, {
      schoolId: fixture.schoolId,
      recipientType: "user",
      recipientId: fixture.ownerId,
      recipientPhone: "233240000088",
      body: "A".repeat(161),
      channels: "sms",
    }));

    expect(message).toBeTruthy();
    expect(await balance(fixture.schoolId)).toBe(8);

    const processed = await processMessageBatchOnce({ sms: async () => { throw new Error("SMS provider HTTP 400"); } }, 20, fixture.schoolId);
    expect(processed).toBe(1);
    expect(await balance(fixture.schoolId)).toBe(10);

    const state = await withTenant(fixture.schoolId, async (tx) => {
      const saved = await tx.message.findFirst({ where: { id: message!.id, schoolId: fixture.schoolId }, select: { status: true } });
      const refunds = await tx.$queryRawUnsafe<Array<{ quantity: number }>>(`SELECT "quantity" FROM "MessageCreditRefund" WHERE "schoolId"=$1 AND "messageId"=$2`, fixture.schoolId, message!.id);
      const ledger = await tx.$queryRawUnsafe<Array<{ entryType: string; quantity: number; balanceAfter: number }>>(`SELECT "entryType","quantity","balanceAfter" FROM "PlatformMessagingLedger" WHERE "schoolId"=$1 AND "reference"=$2`, fixture.schoolId, `message-failure-refund:${message!.id}`);
      return { saved, refunds, ledger };
    });
    expect(state.saved?.status).toBe("failed");
    expect(state.refunds).toEqual([{ quantity: 2 }]);
    expect(state.ledger).toEqual([{ entryType: "adjustment", quantity: 2, balanceAfter: 10 }]);

    // Even if a failed message is reclassified and failed again, the unique refund marker prevents double crediting.
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.update({ where: { id: message!.id }, data: { status: "queued" } });
      await tx.message.update({ where: { id: message!.id }, data: { status: "failed" } });
    });
    expect(await balance(fixture.schoolId)).toBe(10);
  });
});
