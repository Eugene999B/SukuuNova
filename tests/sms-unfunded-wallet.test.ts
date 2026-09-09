import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { enqueueNotification } from "../src/lib/message-outbox";
import { createTenantFixture } from "./helpers";

describe("SMS prepaid wallet enforcement", () => {
  it("does not queue SMS when the school has not been assigned a funded wallet", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, (tx) => tx.$executeRawUnsafe(`DELETE FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`, fixture.schoolId));

    await expect(withTenant(fixture.schoolId, (tx) => enqueueNotification(tx, {
      schoolId: fixture.schoolId,
      recipientType: "user",
      recipientId: fixture.ownerId,
      recipientPhone: "233240000099",
      body: "School SMS requires prepaid credits.",
      channels: "sms",
    }))).rejects.toBeTruthy();

    const count = await withTenant(fixture.schoolId, (tx) => tx.message.count({ where: { schoolId: fixture.schoolId, channel: "sms" } }));
    expect(count).toBe(0);
  });
});
