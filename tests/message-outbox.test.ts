import { describe, expect, it } from "vitest";
import { enqueueNotification, processMessageBatchOnce } from "../src/lib/message-outbox";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

describe("message outbox", () => {
  it("queues a notification without calling an external provider", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      const rows = await enqueueNotification(tx, {
        schoolId: fixture.schoolId, recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233240000000", body: "Queued test", templateKey: "school_announcement"
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.status === "queued")).toBe(true);
      expect(await tx.message.count({ where: { recipientPhone: "+233240000000" } })).toBe(rows.length);
      await tx.message.deleteMany({ where: { recipientPhone: "+233240000000" } });
    });
  });

  it("delivers queued work in the worker and records the attempt", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233241000000", body: "Delivery test", status: "queued", attempts: 0,
        nextAttemptAt: new Date(), idempotencyKey: `test-delivery:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    let providerCalls = 0;
    await processMessageBatchOnce({ sms: async () => { providerCalls += 1; } }, 1, fixture.schoolId);
    expect(providerCalls).toBe(1);
    await withTenant(fixture.schoolId, async (tx) => {
      const message = await tx.message.findFirst({ where: { recipientPhone: "+233241000000" } });
      expect(message?.status).toBe("sent"); expect(message?.attempts).toBe(1);
    });
  });

  it("requeues a temporary provider failure", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233250000000", body: "Retry test", status: "queued", attempts: 0,
        nextAttemptAt: new Date(), idempotencyKey: `test-retry:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    await processMessageBatchOnce({ sms: async () => { throw new Error("temporary network failure"); } }, 1, fixture.schoolId);
    await withTenant(fixture.schoolId, async (tx) => {
      const message = await tx.message.findFirst({ where: { recipientPhone: "+233250000000" } });
      expect(message?.status).toBe("queued"); expect(message?.attempts).toBe(1);
      expect(message?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  it("dead-letters permanent provider failures", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233260000000", body: "Permanent failure test", status: "queued", attempts: 0,
        nextAttemptAt: new Date(), idempotencyKey: `test-permanent:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    await processMessageBatchOnce({ sms: async () => { throw new Error("SMS provider HTTP 400"); } }, 1, fixture.schoolId);
    await withTenant(fixture.schoolId, async (tx) => {
      const message = await tx.message.findFirst({ where: { recipientPhone: "+233260000000" } });
      expect(message?.status).toBe("failed"); expect(message?.lastError).toContain("HTTP 400");
    });
  });

  it("claims queued work so a second worker cannot process it twice", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233270000000", body: "Claim test", status: "queued", attempts: 0,
        nextAttemptAt: new Date(), idempotencyKey: `test-claim:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    let providerCalls = 0;
    const sender = async () => { providerCalls += 1; };
    await Promise.all([
      processMessageBatchOnce({ sms: sender }, 1, fixture.schoolId),
      processMessageBatchOnce({ sms: sender }, 1, fixture.schoolId)
    ]);
    expect(providerCalls).toBe(1);
  });

  it("reclaims an expired sending lease", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233280000000", body: "Lease recovery", status: "sending", attempts: 1,
        nextAttemptAt: new Date(Date.now() - 1_000), idempotencyKey: `test-lease:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    let providerCalls = 0;
    await processMessageBatchOnce({ sms: async () => { providerCalls += 1; } }, 1, fixture.schoolId);
    expect(providerCalls).toBe(1);
    await withTenant(fixture.schoolId, async (tx) => {
      const message = await tx.message.findFirst({ where: { recipientPhone: "+233280000000" } });
      expect(message?.status).toBe("sent"); expect(message?.attempts).toBe(2);
    });
  });

  it("fences a stale worker so it cannot overwrite a newer lease owner", async () => {
    const fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        schoolId: fixture.schoolId, channel: "sms", recipientType: "user", recipientId: fixture.memberId,
        recipientPhone: "+233290000000", body: "Lease fencing", status: "queued", attempts: 0,
        nextAttemptAt: new Date(), idempotencyKey: `test-fence:${fixture.schoolId}:${fixture.memberId}`
      } });
    });
    let providerCalls = 0;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => { firstStarted = resolve; });
    const sender = async () => {
      providerCalls += 1;
      if (providerCalls === 1) {
        firstStarted();
        await firstBlocked;
      }
    };
    const firstWorker = processMessageBatchOnce({ sms: sender }, 1, fixture.schoolId);
    await firstHasStarted;
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.updateMany({
        where: { recipientPhone: "+233290000000", status: "sending" },
        data: { nextAttemptAt: new Date(Date.now() - 1_000) }
      });
    });
    const secondWorker = processMessageBatchOnce({ sms: sender }, 1, fixture.schoolId);
    await secondWorker;
    releaseFirst();
    await firstWorker;
    expect(providerCalls).toBe(2);
    await withTenant(fixture.schoolId, async (tx) => {
      const message = await tx.message.findFirst({ where: { recipientPhone: "+233290000000" } });
      expect(message?.status).toBe("sent"); expect(message?.attempts).toBe(2);
    });
  });
});
