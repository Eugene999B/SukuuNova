import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import {
  createStructuredSupportTicket,
  getSchoolSupportCenter,
  replyToSchoolSupportTicket,
} from "../src/lib/support-center-service";
import { createTenantFixture } from "./helpers";

async function grantMemberSupport(fixture: Awaited<ReturnType<typeof createTenantFixture>>) {
  await withTenant(fixture.schoolId, async (tx) => {
    for (const key of ["support:create", "support:view_own"] as const) {
      await tx.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: fixture.memberId, permissionId: fixture.permissionIds.get(key)! } },
        update: { granted: true },
        create: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId: fixture.permissionIds.get(key)!, granted: true },
      });
    }
  });
}

async function createMemberTicket(fixture: Awaited<ReturnType<typeof createTenantFixture>>) {
  await grantMemberSupport(fixture);
  return withTenant(fixture.schoolId, (tx) => createStructuredSupportTicket(tx, {
    schoolId: fixture.schoolId,
    userId: fixture.memberId,
    kind: "problem",
    module: "transport",
    severity: "high",
    subject: "Bus location stopped updating",
    body: "The Family Portal map stopped moving during an active trip.",
    context: { pagePath: "/guardian/transport", browser: "test-browser", ignoredSecret: "do-not-store" },
  }));
}

describe("Pilot Feedback & Support Center", () => {
  it("creates structured tenant-scoped tickets and preserves only approved diagnostics", async () => {
    const fixture = await createTenantFixture();
    const created = await createMemberTicket(fixture);
    const own = await withTenant(fixture.schoolId, (tx) => getSchoolSupportCenter(tx, { schoolId: fixture.schoolId, userId: fixture.memberId }));
    expect(own.tickets).toHaveLength(1);
    expect(own.tickets[0]).toMatchObject({ id: created.id, kind: "problem", module: "transport", severity: "high", raisedByUserId: fixture.memberId });
    expect(own.tickets[0].context).toMatchObject({ pagePath: "/guardian/transport", browser: "test-browser" });
    expect(own.tickets[0].context).not.toHaveProperty("ignoredSecret");
    expect(own.tickets[0].messages[0]).toMatchObject({ senderType: "school_user", senderName: "Fixture Member" });
  });

  it("lets school managers see the school queue while ordinary users see only their own cases", async () => {
    const fixture = await createTenantFixture();
    await createMemberTicket(fixture);
    await withTenant(fixture.schoolId, (tx) => createStructuredSupportTicket(tx, {
      schoolId: fixture.schoolId,
      userId: fixture.ownerId,
      kind: "suggestion",
      module: "gradebook",
      severity: "low",
      subject: "Add a faster review filter",
      body: "A compact filter for incomplete marks would help during review.",
    }));
    const member = await withTenant(fixture.schoolId, (tx) => getSchoolSupportCenter(tx, { schoolId: fixture.schoolId, userId: fixture.memberId }));
    const owner = await withTenant(fixture.schoolId, (tx) => getSchoolSupportCenter(tx, { schoolId: fixture.schoolId, userId: fixture.ownerId }));
    expect(member.tickets).toHaveLength(1);
    expect(owner.tickets).toHaveLength(2);
    expect(owner.access.canManage).toBe(true);
  });

  it("classifies legacy-style platform replies as platform_admin at the database boundary", async () => {
    const fixture = await createTenantFixture();
    const ticket = await createMemberTicket(fixture);
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "SupportTicketMessage" ("id","schoolId","ticketId","senderId","body") VALUES ($1,$2,$3,$4,$5)`,
        createId(), fixture.schoolId, ticket.id, "platform-admin-test", "We are investigating this transport case.",
      );
    });
    const center = await withTenant(fixture.schoolId, (tx) => getSchoolSupportCenter(tx, { schoolId: fixture.schoolId, userId: fixture.memberId }));
    const platformReply = center.tickets[0].messages.find((message) => message.body.includes("investigating"));
    expect(platformReply).toMatchObject({ senderType: "platform_admin", senderName: "SukuuNova Support" });
  });

  it("reopens a resolved case when the owning school user replies and audits the action", async () => {
    const fixture = await createTenantFixture();
    const ticket = await createMemberTicket(fixture);
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "SupportTicket" SET "status"='resolved' WHERE "schoolId"=$1 AND "id"=$2`, fixture.schoolId, ticket.id);
    });
    const result = await withTenant(fixture.schoolId, (tx) => replyToSchoolSupportTicket(tx, {
      schoolId: fixture.schoolId,
      userId: fixture.memberId,
      ticketId: ticket.id,
      body: "The issue happened again after the bus restarted.",
    }));
    expect(result.status).toBe("open");
    const audits = await withTenant(fixture.schoolId, (tx) => tx.auditLogSchool.findMany({ where: { entityId: ticket.id }, orderBy: { createdAt: "asc" } }));
    expect(audits.map((row) => row.action)).toContain("support.ticket_replied");
  });

  it("rejects unsafe attachment links", async () => {
    const fixture = await createTenantFixture();
    await grantMemberSupport(fixture);
    await expect(withTenant(fixture.schoolId, (tx) => createStructuredSupportTicket(tx, {
      schoolId: fixture.schoolId,
      userId: fixture.memberId,
      kind: "problem",
      module: "general",
      severity: "medium",
      subject: "Unsafe attachment",
      body: "This should be rejected before a ticket is created.",
      attachmentUrl: "javascript:alert(1)",
    }))).rejects.toMatchObject({ code: "SUPPORT_ATTACHMENT_INVALID" });
  });

  it("cannot read another school's support queue through tenant context", async () => {
    const first = await createTenantFixture();
    const second = await createTenantFixture();
    await createMemberTicket(first);
    const secondQueue = await withTenant(second.schoolId, (tx) => getSchoolSupportCenter(tx, { schoolId: second.schoolId, userId: second.ownerId }));
    expect(secondQueue.tickets).toEqual([]);
  });
});
