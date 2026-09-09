import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import { filterGuardianReleasedScores, getGuardianFamilyContext } from "../src/lib/guardian-family-context";
import { createTenantFixture } from "./helpers";

const guardianSession = vi.hoisted(() => ({ current: null as null | {
  kind: "guardian";
  userId: string;
  guardianId: string;
  schoolId: string;
  name: string;
  schoolName: string;
  needsPasswordChange: boolean;
  authorizationVersion: string;
} }));
vi.mock("@/lib/guardian-auth", () => ({
  requireGuardianSession: vi.fn(async () => {
    if (!guardianSession.current) throw new Error("Guardian test session not configured.");
    return guardianSession.current;
  }),
}));

import { guardianAcademicContextStudentId } from "../src/app/api/guardian/academic/route";
import { GET as getMessages, POST as postMessage } from "../src/app/api/guardian/messages/route";

async function setupFamily() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Family class" } });
    const guardian = await tx.guardian.create({ data: {
      schoolId: fixture.schoolId,
      userId: fixture.memberId,
      name: "Family Guardian",
      phone: `+233${Math.floor(Math.random() * 900000000 + 100000000)}`,
    } });
    const first = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: `F-${createId()}`, name: "Ama Linked" } });
    const second = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: `S-${createId()}`, name: "Kojo Linked" } });
    const unrelated = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, admissionNo: `U-${createId()}`, name: "Unrelated Learner" } });
    await tx.studentGuardian.createMany({ data: [
      { schoolId: fixture.schoolId, studentId: first.id, guardianId: guardian.id, relationship: "Mother", isPrimary: true },
      { schoolId: fixture.schoolId, studentId: second.id, guardianId: guardian.id, relationship: "Mother", isPrimary: false },
    ] });
    return { guardianId: guardian.id, firstId: first.id, secondId: second.id, unrelatedId: unrelated.id };
  });
  guardianSession.current = {
    kind: "guardian",
    userId: fixture.memberId,
    guardianId: ids.guardianId,
    schoolId: fixture.schoolId,
    name: "Fixture Member",
    schoolName: "Fixture School",
    needsPasswordChange: false,
    authorizationVersion: "test",
  };
  return { ...fixture, ...ids };
}

function variables(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

describe("guardian family context", () => {
  it("returns only linked children and rejects guessed learner IDs", async () => {
    const fixture = await setupFamily();
    const all = await withTenant(fixture.schoolId, (tx) => getGuardianFamilyContext(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      userId: fixture.memberId,
    }));
    expect(all.children.map((child) => child.id).sort()).toEqual([fixture.firstId, fixture.secondId].sort());
    expect(all.children.map((child) => child.name)).toEqual(["Ama Linked", "Kojo Linked"]);

    const selected = await withTenant(fixture.schoolId, (tx) => getGuardianFamilyContext(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      userId: fixture.memberId,
      studentId: fixture.secondId,
    }));
    expect(selected.selectedChild?.id).toBe(fixture.secondId);

    await expect(withTenant(fixture.schoolId, (tx) => getGuardianFamilyContext(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      userId: fixture.memberId,
      studentId: fixture.unrelatedId,
    }))).rejects.toMatchObject({ status: 403 });

    await expect(withTenant(fixture.schoolId, (tx) => getGuardianFamilyContext(tx, {
      schoolId: fixture.schoolId,
      guardianId: fixture.guardianId,
      userId: fixture.ownerId,
    }))).rejects.toMatchObject({ status: 403 });
  });

  it("never treats one sibling's released term as permission to expose another sibling's score", () => {
    const scores = [
      { id: "term-one-score", assessment: { termId: "term-one" } },
      { id: "term-two-score", assessment: { termId: "term-two" } },
    ];
    expect(filterGuardianReleasedScores(scores, [{ termId: "term-one" }]).map((row) => row.id)).toEqual(["term-one-score"]);
    expect(filterGuardianReleasedScores(scores, [{ termId: "term-two" }]).map((row) => row.id)).toEqual(["term-two-score"]);
    expect(filterGuardianReleasedScores(scores, []).map((row) => row.id)).toEqual([]);
  });

  it("uses explicit or same-origin academic page child context but ignores foreign and unrelated referers", () => {
    const explicit = new Request("https://school.test/api/guardian/academic?studentId=explicit", {
      headers: { referer: "https://school.test/guardian/academic?studentId=referer-child" },
    });
    expect(guardianAcademicContextStudentId(explicit)).toBe("explicit");

    const sameOrigin = new Request("https://school.test/api/guardian/academic", {
      headers: { referer: "https://school.test/guardian/academic?studentId=linked-child" },
    });
    expect(guardianAcademicContextStudentId(sameOrigin)).toBe("linked-child");

    const wrongPath = new Request("https://school.test/api/guardian/academic", {
      headers: { referer: "https://school.test/guardian/fees?studentId=linked-child" },
    });
    expect(guardianAcademicContextStudentId(wrongPath)).toBeUndefined();

    const foreignOrigin = new Request("https://school.test/api/guardian/academic", {
      headers: { referer: "https://evil.invalid/guardian/academic?studentId=linked-child" },
    });
    expect(guardianAcademicContextStudentId(foreignOrigin)).toBeUndefined();
  });
});

describe("guardian message boundary", () => {
  it("uses the guardian relationship, preserves school sender metadata on read, and audits the real outgoing message", async () => {
    const fixture = await setupFamily();
    const incomingId = createId();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.message.create({ data: {
        id: incomingId,
        schoolId: fixture.schoolId,
        channel: "in_app",
        recipientType: "user",
        recipientId: fixture.memberId,
        recipientPhone: "",
        body: "School notice\n\nPlease read this.",
        templateKey: "direct_message",
        templateVariables: { title: "School notice", senderType: "school_user", senderId: fixture.ownerId, senderName: "Fixture Owner", attachments: [] },
        status: "delivered",
        attempts: 1,
        nextAttemptAt: new Date(),
        idempotencyKey: `guardian-incoming:${fixture.schoolId}:${incomingId}`,
      } });
    });

    const readResponse = await postMessage(new Request("http://localhost/api/guardian/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", messageId: incomingId }),
    }));
    expect(readResponse.status).toBe(200);
    const readRow = await withTenant(fixture.schoolId, (tx) => tx.message.findUnique({ where: { id: incomingId } }));
    const readMeta = variables(readRow?.templateVariables);
    expect(readRow?.status).toBe("delivered");
    expect(readMeta.senderType).toBe("school_user");
    expect(readMeta.senderId).toBe(fixture.ownerId);
    expect(typeof readMeta.readAt).toBe("string");

    const sendResponse = await postMessage(new Request("http://localhost/api/guardian/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send", recipientId: fixture.ownerId, title: "Family question", body: "Please help with this learner record." }),
    }));
    expect(sendResponse.status).toBe(200);
    const outgoing = await withTenant(fixture.schoolId, (tx) => tx.message.findFirst({
      where: { schoolId: fixture.schoolId, recipientId: fixture.ownerId, templateKey: "direct_message", body: { startsWith: "Family question" } },
      orderBy: { createdAt: "desc" },
    }));
    expect(outgoing).not.toBeNull();
    const outgoingMeta = variables(outgoing?.templateVariables);
    expect(outgoingMeta.senderType).toBe("guardian");
    expect(outgoingMeta.senderId).toBe(fixture.memberId);
    const audit = await withTenant(fixture.schoolId, (tx) => tx.auditLogSchool.findFirst({
      where: { schoolId: fixture.schoolId, action: "message.sent", entityType: "Message", entityId: outgoing!.id },
      orderBy: { createdAt: "desc" },
    }));
    expect(audit).not.toBeNull();

    const inbox = await getMessages();
    expect(inbox.status).toBe(200);
    const body = await inbox.json() as { unreadCount: number; messages: Array<{ id: string; readAt: string | null }> };
    expect(body.messages.find((message) => message.id === incomingId)?.readAt).toBeTruthy();
  });

  it("denies a guardian session whose Guardian row is no longer linked", async () => {
    await setupFamily();
    guardianSession.current = { ...guardianSession.current!, guardianId: createId() };
    const response = await getMessages();
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: string };
    expect(body.error).toBe("FORBIDDEN");
  });
});
