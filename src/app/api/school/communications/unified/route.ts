import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { getSchoolAuthorization } from "@/lib/authorization";
import { hasPermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { enqueueNotification } from "@/lib/message-outbox";

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().max(120),
  size: z.number().int().positive().max(1500000),
  dataUrl: z.string().startsWith("data:").max(2200000),
});

const sendSchema = z.object({
  action: z.literal("send"),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(5000),
  channel: z.enum(["in_app", "sms", "whatsapp"]),
  audience: z.enum(["individual", "guardians", "teachers", "staff", "all"]),
  userId: z.string().trim().min(1).max(100).optional(),
  mediaUrl: z.string().url().max(2000).optional(),
  attachments: z.array(attachmentSchema).max(3).default([]),
});

function meta(title: string, senderType: string, senderId: string, senderName: string, attachments: unknown[]) {
  return JSON.parse(JSON.stringify({ title, senderType, senderId, senderName, attachments }));
}

function requireExternalConfig(channel: "sms" | "whatsapp") {
  if (channel === "sms") {
    if (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN) {
      throw new Error("SMS is not configured for this school. Configure the SMS provider before sending.");
    }
    return;
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
    throw new Error("WhatsApp is not configured. Configure the Twilio WhatsApp sender before sending.");
  }
}

async function canManage(schoolId: string, userId: string) {
  return withTenant(schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, userId);
    return access.isOwner || await hasPermission(tx, userId, "communications:manage") || access.can("templates:manage");
  });
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return withTenant(session.schoolId, async (tx) => {
      const [inbox, sent, recipients, school] = await Promise.all([
        tx.message.findMany({
          where: { schoolId: session.schoolId, channel: "in_app", recipientId: session.userId },
          orderBy: { createdAt: "desc" }, take: 100,
          select: { id: true, body: true, status: true, createdAt: true, sentAt: true, lastError: true, templateVariables: true, mediaUrl: true },
        }),
        tx.message.findMany({
          where: { schoolId: session.schoolId, templateVariables: { not: null } },
          orderBy: { createdAt: "desc" }, take: 100,
          select: { id: true, channel: true, recipientType: true, recipientId: true, body: true, status: true, createdAt: true, sentAt: true, lastError: true, templateVariables: true, mediaUrl: true },
        }),
        tx.user.findMany({
          where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, take: 500,
          select: { id: true, name: true, email: true, phone: true, userRoles: { select: { role: { select: { name: true, key: true } } } }, guardianProfiles: { select: { id: true } } },
        }),
        tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      ]);
      return NextResponse.json({
        school,
        inbox,
        sent,
        unreadCount: inbox.filter((m) => m.status !== "read").length,
        recipients: recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, roles: r.userRoles.map((x) => x.role.key || x.role.name), isGuardian: r.guardianProfiles.length > 0 })),
      }, { headers: { "cache-control": "private, max-age=5, stale-while-revalidate=10" } });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = sendSchema.parse(await request.json());
    if (!(await canManage(session.schoolId, session.userId))) throw new ForbiddenError("You are not authorised to send school messages.");
    const attachments = input.attachments;
    const totalAttachmentBytes = attachments.reduce((sum, item) => sum + item.size, 0);
    if (totalAttachmentBytes > 3000000) return NextResponse.json({ error: "ATTACHMENTS_TOO_LARGE", message: "Keep message attachments under 3 MB total." }, { status: 413 });
    if (input.channel !== "in_app" && attachments.length) return NextResponse.json({ error: "EXTERNAL_ATTACHMENTS_REQUIRE_URL", message: "For SMS/WhatsApp, use a public media URL. File uploads are available in portal messages." }, { status: 400 });
    if (input.channel === "whatsapp") requireExternalConfig("whatsapp");
    if (input.channel === "sms") requireExternalConfig("sms");
    return withTenant(session.schoolId, async (tx) => {
      let recipients: Array<{ id: string; name: string; phone: string | null }> = [];
      if (input.audience === "individual") {
        const user = input.userId ? await tx.user.findFirst({ where: { id: input.userId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true } }) : null;
        if (user) recipients = [user];
      } else if (input.audience === "guardians") {
        recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: 1000 });
      } else if (input.audience === "teachers") {
        recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", userRoles: { some: { role: { key: { in: ["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"] } } } } }, select: { id: true, name: true, phone: true }, take: 1000 });
      } else if (input.audience === "staff") {
        recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { none: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: 1000 });
      } else {
        recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true }, take: 1000 });
      }
      if (!recipients.length) return NextResponse.json({ ok: true, sent: 0, message: "No active recipients matched that audience." });
      const senderMeta = meta(input.title, "school_user", session.userId, session.name, attachments);
      const body = `${input.title}\n\n${input.body}`;
      let delivered = 0;
      let queued = 0;
      for (const recipient of recipients) {
        if (input.channel === "in_app") {
          await tx.message.create({ data: { schoolId: session.schoolId, channel: "in_app", recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone || "", body, templateKey: "direct_message", templateVariables: senderMeta, mediaUrl: input.mediaUrl || null, status: "delivered", attempts: 1, sentAt: new Date(), nextAttemptAt: new Date(), idempotencyKey: `portal:${session.schoolId}:${session.userId}:${recipient.id}:${Date.now()}:${randomBytes(5).toString("hex")}` } });
          delivered++;
          continue;
        }
        if (!recipient.phone) continue;
        const jobs = await enqueueNotification(tx, { schoolId: session.schoolId, recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone, body, templateKey: input.channel === "whatsapp" ? "school_announcement" : undefined, templateVariables: senderMeta, mediaUrl: input.mediaUrl });
        queued += jobs.length;
      }
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "message.sent", entityType: "MessageBatch", entityId: `message-${Date.now()}`, after: { title: input.title, audience: input.audience, channel: input.channel, matchedRecipients: recipients.length, delivered, queued, attachmentCount: attachments.length } });
      revalidatePath("/school/communications/messages");
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, matchedRecipients: recipients.length, delivered, queued, message: input.channel === "in_app" ? `Delivered to ${delivered} recipient${delivered === 1 ? "" : "s"}.` : `Queued ${queued} delivery job${queued === 1 ? "" : "s"}.` });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Check the message, audience, channel and attachments." }, { status: 400 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    if (error instanceof Error && /not configured/i.test(error.message)) return NextResponse.json({ error: "NOTIFICATION_PROVIDER_UNAVAILABLE", message: error.message }, { status: 503 });
    return routeError(error);
  }
}
