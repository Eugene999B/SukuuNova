import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

const sendSchema = z.object({
  action: z.literal("send"),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(5000),
  recipientId: z.string().trim().min(1).max(100),
});
const readSchema = z.object({ action: z.literal("mark_read"), messageId: z.string().min(1).max(120) });

type RawMessage = {
  id: string;
  body: string;
  status: string;
  createdAt: Date;
  templateVariables: unknown;
  mediaUrl: string | null;
  recipientId: string;
};

function meta(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function payload(title: string, id: string, name: string, extra: Record<string, unknown> = {}) {
  return JSON.parse(JSON.stringify({ title, senderType: "guardian", senderId: id, senderName: name, attachments: [], ...extra }));
}

export async function GET() {
  try {
    const session = await requireGuardianSession();
    return await withTenant(session.schoolId, async (tx) => {
      const linked = await tx.guardian.findFirst({
        where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
        select: { id: true },
      });
      if (!linked) throw new ForbiddenError("Guardian messaging is not available for this account.");

      const [incoming, outgoing, staff] = await Promise.all([
        tx.message.findMany({
          where: { schoolId: session.schoolId, channel: "in_app", recipientId: session.userId },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, body: true, status: true, createdAt: true, templateVariables: true, mediaUrl: true, recipientId: true },
        }),
        tx.$queryRawUnsafe<RawMessage[]>(
          `SELECT "id","body","status","createdAt","templateVariables","mediaUrl","recipientId" FROM "Message" WHERE "schoolId"=$1 AND "channel"='in_app' AND "templateVariables"->>'senderType'='guardian' AND "templateVariables"->>'senderId'=$2 ORDER BY "createdAt" DESC LIMIT 100`,
          session.schoolId,
          session.userId,
        ),
        tx.user.findMany({
          where: {
            schoolId: session.schoolId,
            status: "active",
            guardianProfiles: { none: { schoolId: session.schoolId } },
            userRoles: { some: {} },
          },
          orderBy: { name: "asc" },
          take: 500,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userRoles: { select: { role: { select: { name: true, key: true } } } },
          },
        }),
      ]);
      const staffById = new Map(staff.map((person) => [person.id, person]));
      const messages = [
        ...incoming.map((message) => {
          const metadata = meta(message.templateVariables);
          return {
            ...message,
            direction: "incoming" as const,
            title: typeof metadata.title === "string" ? metadata.title : message.body.split("\n")[0],
            senderName: typeof metadata.senderName === "string" ? metadata.senderName : "School communication",
            senderId: typeof metadata.senderId === "string" ? metadata.senderId : null,
            recipientName: session.name,
            readAt: typeof metadata.readAt === "string" ? metadata.readAt : null,
            attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
          };
        }),
        ...outgoing.map((message) => {
          const metadata = meta(message.templateVariables);
          const recipient = staffById.get(message.recipientId);
          return {
            ...message,
            direction: "outgoing" as const,
            title: typeof metadata.title === "string" ? metadata.title : message.body.split("\n")[0],
            senderName: session.name,
            senderId: session.userId,
            recipientName: recipient?.name || "School staff",
            readAt: null,
            attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
          };
        }),
      ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 150);

      return NextResponse.json({
        messages,
        unreadCount: messages.filter((message) => message.direction === "incoming" && !message.readAt).length,
        recipients: staff.map((person) => ({
          id: person.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          roles: person.userRoles.map(({ role }) => role.key?.trim() || role.name),
        })),
      });
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    const raw = await request.json();
    return await withTenant(session.schoolId, async (tx) => {
      const linked = await tx.guardian.findFirst({
        where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
        select: { id: true },
      });
      if (!linked) throw new ForbiddenError("Guardian messaging is not available for this account.");

      if (raw?.action === "mark_read") {
        const value = readSchema.parse(raw);
        const message = await tx.message.findFirst({
          where: { id: value.messageId, schoolId: session.schoolId, recipientId: session.userId, channel: "in_app" },
          select: { id: true, body: true, templateVariables: true },
        });
        if (!message) return NextResponse.json({ error: "NOT_FOUND", message: "Message not found." }, { status: 404 });
        const current = meta(message.templateVariables);
        const readMeta = { ...current, readAt: new Date().toISOString() };
        await tx.message.update({
          where: { id: message.id },
          data: {
            templateVariables: JSON.parse(JSON.stringify({
              title: String(current.title || message.body.split("\n")[0]),
              senderType: typeof current.senderType === "string" ? current.senderType : "school_user",
              senderId: typeof current.senderId === "string" ? current.senderId : "system",
              senderName: typeof current.senderName === "string" ? current.senderName : "School communication",
              attachments: Array.isArray(current.attachments) ? current.attachments : [],
              ...readMeta,
            })),
          },
        });
        return NextResponse.json({ ok: true });
      }

      const input = sendSchema.parse(raw);
      const target = await tx.user.findFirst({
        where: { id: input.recipientId, schoolId: session.schoolId, status: "active" },
        select: { id: true, name: true, phone: true, guardianProfiles: { select: { id: true } } },
      });
      if (!target) return NextResponse.json({ error: "NOT_FOUND", message: "Recipient not found." }, { status: 404 });
      if (target.guardianProfiles.length > 0) throw new ForbiddenError("Families may message school staff directly, not other family accounts.");

      const message = await tx.message.create({
        data: {
          schoolId: session.schoolId,
          channel: "in_app",
          recipientType: "user",
          recipientId: target.id,
          recipientPhone: target.phone || "",
          body: `${input.title}\n\n${input.body}`,
          templateKey: "direct_message",
          templateVariables: payload(input.title, session.userId, session.name),
          status: "delivered",
          attempts: 1,
          sentAt: new Date(),
          nextAttemptAt: new Date(),
          idempotencyKey: `guardian:${session.schoolId}:${session.userId}:${target.id}:${Date.now()}:${randomBytes(5).toString("hex")}`,
        },
        select: { id: true },
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "message.sent",
        entityType: "Message",
        entityId: message.id,
        after: { title: input.title, recipientId: target.id, channel: "in_app", guardianDirectMessage: true },
      });
      return NextResponse.json({ ok: true, message: `Delivered to ${target.name}.`, messageId: message.id });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Choose a recipient and complete the message." }, { status: 400 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return routeError(error);
  }
}
