import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasPermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { enqueueNotification } from "@/lib/message-outbox";
import { createCalendarEventTx } from "@/lib/calendar-service";
import { getSchoolAuthorization } from "@/lib/authorization";
import { cacheTenantRead } from "@/lib/server-cache";

type Recipient = { id: string; name: string; phone: string | null };
type JsonRecord = Record<string, unknown>;
const sendSchema = z.object({ action: z.literal("send"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "individual"]), channel: z.enum(["in_app", "sms", "whatsapp"]), userId: z.string().trim().min(1).max(100).optional(), mediaUrl: z.string().url().max(2000).optional() });
const broadcastSchema = z.object({ action: z.literal("broadcast"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "all"]), channel: z.enum(["sms", "whatsapp"]), scheduleAt: z.string().max(40).optional(), mediaUrl: z.string().url().max(2000).optional() });
// One request fans out inside a single transaction; cap the batch so a huge
// school cannot time out the request. The response states the cap explicitly.
const MAX_BROADCAST_RECIPIENTS = 1000;
const eventFlag = z.union([z.boolean(), z.string()]).optional();
const eventSchema = z.object({ action: z.literal("create_event"), name: z.string().trim().min(2).max(180), type: z.string().trim().min(2).max(40), startDate: z.string().min(1), endDate: z.string().min(1), location: z.string().optional(), description: z.string().max(5000).optional(), affectsAttendance: eventFlag, affectsTransport: eventFlag, notifyGuardians: eventFlag, notifyStaff: eventFlag });
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function flag(value: boolean | string | undefined): boolean | undefined { if (value === undefined) return undefined; if (typeof value === "boolean") return value; return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase()); }
async function canCommunicate(schoolId: string, userId: string) {
  return withTenant(schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, userId);
    if (access.isOwner) return true;
    // communications:manage is the dedicated permission; templates:manage is
    // still honoured so existing template managers keep working.
    if (await hasPermission(tx, userId, "communications:manage")) return true;
    return access.can("templates:manage");
  });
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    if (!(await canCommunicate(session.schoolId, session.userId))) throw new ForbiddenError("Your account is not authorised to view school communications.");
    const data = await cacheTenantRead(["communications", "read", session.schoolId], () => withTenant(session.schoolId, async (tx) => {
      const [messages, recipients, settings, events] = await Promise.all([
        tx.message.findMany({ where: { schoolId: session.schoolId }, orderBy: { createdAt: "desc" }, take: 80, select: { id: true, channel: true, recipientType: true, recipientId: true, body: true, status: true, createdAt: true, sentAt: true, nextAttemptAt: true, lastError: true } }),
        tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, phone: true, userRoles: { select: { role: { select: { name: true } } } } } }),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { smsSenderId: true, notificationChannels: true, whatsappTemplateConfig: true } }),
        tx.calendarEvent.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "asc" }, take: 80 }),
      ]);
      return { messages, recipients: recipients.map((r) => ({ id: r.id, name: r.name, phone: r.phone, roles: r.userRoles.map((x) => x.role.name) })), settings: { smsSenderId: settings?.smsSenderId || null, channels: settings?.notificationChannels || [], whatsapp: settings?.whatsappTemplateConfig || {} }, events };
    }), 15, [`communications:${session.schoolId}`]);
    return NextResponse.json(data, { headers: { "cache-control": "private, max-age=15, stale-while-revalidate=15" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await request.json();
    if (!(await canCommunicate(session.schoolId, session.userId))) throw new ForbiddenError("Your account is not authorised to manage school communications.");

    if (input?.action === "send") {
      const value = sendSchema.parse(input);
      return withTenant(session.schoolId, async (tx) => {
        let recipients: Recipient[] = [];
        if (value.audience === "individual") { const user = value.userId ? await tx.user.findFirst({ where: { id: value.userId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true } }) : null; if (user) recipients = [user]; }
        else if (value.audience === "guardians") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else if (value.audience === "teachers") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", userRoles: { some: { role: { key: { in: ["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"] } } } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else if (value.audience === "staff") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { none: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        if (!recipients.length) return NextResponse.json({ ok: true, message: "No recipients matched that audience." });
        const capped = recipients.length >= MAX_BROADCAST_RECIPIENTS;
        if (value.channel === "in_app") {
          const batchKey = `direct:${session.schoolId}:${Date.now()}`; const now = new Date();
          await tx.message.createMany({ data: recipients.map((r) => ({ schoolId: session.schoolId, channel: "in_app", recipientType: "user", recipientId: r.id, recipientPhone: r.phone || "", body: `${value.title}\n\n${value.body}`, templateKey: "direct_message", templateVariables: { title: value.title }, mediaUrl: value.mediaUrl || null, status: "delivered", attempts: 1, sentAt: now, nextAttemptAt: now, idempotencyKey: `${batchKey}:${r.id}:in_app` })) });
        } else for (const recipient of recipients) { if (!recipient.phone) continue; await enqueueNotification(tx, { schoolId: session.schoolId, recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone, body: `${value.title}\n\n${value.body}`, templateKey: value.channel === "whatsapp" ? "school_announcement" : undefined, templateVariables: { title: value.title, body: value.body }, mediaUrl: value.mediaUrl }); }
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "message.sent", entityType: "MessageBatch", entityId: `message-${Date.now()}`, after: { title: value.title, audience: value.audience, channel: value.channel, recipientCount: recipients.length } });
        revalidatePath("/school/communications/messages"); revalidatePath("/school/communications/broadcasts"); revalidatePath("/school/communications/announcements");
        return NextResponse.json({ ok: true, message: `Message sent to ${recipients.length} matched recipient${recipients.length === 1 ? "" : "s"}.${capped ? ` Limited to ${MAX_BROADCAST_RECIPIENTS} per request — narrow the audience and send again for the rest.` : ""}` });
      });
    }

    if (input?.action === "broadcast") {
      const value = broadcastSchema.parse(input);
      const scheduledAt = value.scheduleAt ? new Date(value.scheduleAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "INVALID_INPUT", message: "Choose a valid schedule time." }, { status: 400 });
      if (scheduledAt && scheduledAt.getTime() <= Date.now()) return NextResponse.json({ error: "INVALID_INPUT", message: "Scheduled broadcast time must be in the future." }, { status: 400 });
      return withTenant(session.schoolId, async (tx) => {
        let recipients: Recipient[] = [];
        if (value.audience === "guardians") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else if (value.audience === "teachers") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", userRoles: { some: { role: { key: { in: ["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"] } } } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else if (value.audience === "staff") recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active", guardianProfiles: { none: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        else recipients = await tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true }, take: MAX_BROADCAST_RECIPIENTS });
        const capped = recipients.length >= MAX_BROADCAST_RECIPIENTS;
        let queued = 0;
        for (const recipient of recipients) {
          if (!recipient.phone) continue;
          if (value.channel === "sms" && !process.env.SMS_PROVIDER_URL) break;
          if (value.channel === "whatsapp" && !process.env.TWILIO_ACCOUNT_SID) break;
          await enqueueNotification(tx, { schoolId: session.schoolId, recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone, body: `${value.title}\n\n${value.body}`, templateKey: value.channel === "whatsapp" ? "school_announcement" : undefined, templateVariables: { title: value.title, body: value.body }, mediaUrl: value.mediaUrl, scheduledAt: scheduledAt || undefined, idempotencyKey: `broadcast:${session.schoolId}:${value.audience}:${value.channel}:${value.title}:${value.body}:${scheduledAt?.toISOString() || "now"}` });
          queued++;
        }
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: scheduledAt ? "broadcast.scheduled" : "broadcast.queued", entityType: "Broadcast", entityId: `broadcast-${Date.now()}`, after: { title: value.title, audience: value.audience, channel: value.channel, recipientCount: queued, scheduleAt: scheduledAt?.toISOString() || null } });
        revalidatePath("/school/communications/messages"); revalidatePath("/school/communications/broadcasts");
        return NextResponse.json({ ok: true, message: scheduledAt ? `Broadcast scheduled for ${scheduledAt.toLocaleString("en-GH")}. ${queued} recipient${queued === 1 ? "" : "s"} queued.${capped ? ` Limited to ${MAX_BROADCAST_RECIPIENTS} per request.` : ""}` : `Broadcast queued for ${queued} recipient${queued === 1 ? "" : "s"}.${capped ? ` Limited to ${MAX_BROADCAST_RECIPIENTS} per request — narrow the audience and send again for the rest.` : ""}` });
      });
    }

    if (input?.action === "create_event") {
      const value = eventSchema.parse(input); const start = new Date(value.startDate); const end = new Date(value.endDate);
      return withTenant(session.schoolId, async (tx) => {
        const year = await tx.academicYear.findFirst({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" } });
        if (!year) throw new Error("Create an academic year before creating calendar events.");
        const result = await createCalendarEventTx(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          academicYearId: year.id,
          type: value.type,
          name: value.name,
          startDate: start,
          endDate: end,
          ...(value.affectsAttendance === undefined ? {} : { affectsAttendance: flag(value.affectsAttendance) }),
          ...(value.affectsTransport === undefined ? {} : { affectsTransport: flag(value.affectsTransport) }),
          notifyGuardians: flag(value.notifyGuardians),
          notifyStaff: flag(value.notifyStaff),
          location: value.location || null,
          description: value.description || null,
        });
        revalidatePath("/school/events");
        revalidatePath("/school/communications/messages");
        return NextResponse.json({ ok: true, message: `Event created. ${result.guardianRecipients} guardian and ${result.staffRecipients} staff notification recipient${result.guardianRecipients + result.staffRecipients === 1 ? " was" : "s were"} queued.`, event: result.event });
      });
    }

    if (input?.action === "save_settings") {
      const rawChannels: unknown[] = Array.isArray(input.channels) ? input.channels : ["in_app"];
      const channels = [...new Set(rawChannels.filter((c): c is string => c === "in_app" || c === "sms" || c === "whatsapp"))];
      if (!channels.length) return NextResponse.json({ error: "INVALID_INPUT", message: "Select at least one communication channel." }, { status: 400 });
      const whatsappFrom = typeof input.whatsappFrom === "string" && input.whatsappFrom.trim() ? input.whatsappFrom.trim().slice(0, 40) : null;
      const reportCardMediaBase = typeof input.reportCardMediaBase === "string" && input.reportCardMediaBase.trim() ? input.reportCardMediaBase.trim().slice(0, 2000) : null;
      if (reportCardMediaBase) { try { new URL(reportCardMediaBase); } catch { return NextResponse.json({ error: "INVALID_INPUT", message: "Report-card media base must be a valid URL." }, { status: 400 }); } }
      return withTenant(session.schoolId, async (tx) => {
        const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { notificationChannels: true, whatsappTemplateConfig: true } }); const currentChannels = asRecord(current?.notificationChannels); const nextConfig = { ...asRecord(current?.whatsappTemplateConfig) };
        if (whatsappFrom) Object.assign(nextConfig, { from: whatsappFrom }); if (reportCardMediaBase) Object.assign(nextConfig, { reportCardMediaBase });
        const notificationConfig = { channels, smsCredits: typeof currentChannels.smsCredits === "number" ? currentChannels.smsCredits : 0, automation: { payment_received: Boolean(input.payment_received), report_card_ready: Boolean(input.report_card_ready), student_absence: Boolean(input.student_absence), staff_late: Boolean(input.staff_late), transport_boarding: Boolean(input.transport_boarding), emergency_broadcast: Boolean(input.emergency_broadcast) } };
        const smsSenderId = typeof input.smsSenderId === "string" && input.smsSenderId.trim() ? input.smsSenderId.trim().slice(0, 20) : undefined;
        await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: { smsSenderId, notificationChannels: JSON.parse(JSON.stringify(notificationConfig)) as Prisma.InputJsonValue, whatsappTemplateConfig: JSON.parse(JSON.stringify(nextConfig)) as Prisma.InputJsonValue } });
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "communications.settings_updated", entityType: "SchoolSettings", entityId: session.schoolId, after: JSON.parse(JSON.stringify(notificationConfig)) }); revalidatePath("/school/communications/settings"); return NextResponse.json({ ok: true, message: "Communication settings saved." });
      });
    }
    return NextResponse.json({ error: "INVALID_ACTION", message: "Unsupported communication action." }, { status: 400 });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Please complete the communication details." }, { status: 400 }); if (error instanceof ForbiddenError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status }); return routeError(error); }
}
