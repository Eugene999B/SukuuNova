import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { enqueueNotification } from "@/lib/message-outbox";
import { createCalendarEvent } from "@/lib/calendar-service";
import { getSchoolAuthorization } from "@/lib/authorization";
import { cacheTenantRead } from "@/lib/server-cache";

type Recipient = { id: string; name: string; phone: string | null };
type JsonRecord = Record<string, unknown>;
const sendSchema = z.object({ action: z.literal("send"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "individual"]), channel: z.enum(["in_app", "sms", "whatsapp"]), userId: z.string().optional(), mediaUrl: z.string().url().optional() });
const broadcastSchema = z.object({ action: z.literal("broadcast"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "all"]), channel: z.enum(["sms", "whatsapp"]), scheduleAt: z.string().optional(), mediaUrl: z.string().url().optional() });
const eventSchema = z.object({ action: z.literal("create_event"), name: z.string().trim().min(2).max(180), type: z.string().trim().min(2).max(40), startDate: z.string().min(1), endDate: z.string().min(1), location: z.string().optional(), description: z.string().max(5000).optional(), notifyGuardians: z.string().optional(), notifyStaff: z.string().optional() });
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
async function canCommunicate(schoolId: string, userId: string) { return withTenant(schoolId, async (tx) => { const access = await getSchoolAuthorization(tx, userId); return access.isOwner || (await access.can("templates:manage")); }); }

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
        if (value.audience === "individual") { const user = await tx.user.findFirst({ where: { id: value.userId, status: "active" }, select: { id: true, name: true, phone: true } }); if (user) recipients = [user]; }
        else if (value.audience === "guardians") recipients = await tx.user.findMany({ where: { status: "active", guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true } });
        else if (value.audience === "teachers") recipients = await tx.user.findMany({ where: { status: "active", userRoles: { some: { role: { key: { in: ["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"] } } } } }, select: { id: true, name: true, phone: true } });
        else if (value.audience === "staff") recipients = await tx.user.findMany({ where: { status: "active", guardianProfiles: { none: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true } });
        else recipients = await tx.user.findMany({ where: { status: "active" }, select: { id: true, name: true, phone: true } });
        if (!recipients.length) return NextResponse.json({ ok: true, message: "No recipients matched that audience." });
        if (value.channel === "in_app") {
          const batchKey = `direct:${session.schoolId}:${Date.now()}`; const now = new Date();
          await tx.message.createMany({ data: recipients.map((r) => ({ schoolId: session.schoolId, channel: "in_app", recipientType: "user", recipientId: r.id, recipientPhone: r.phone || "", body: `${value.title}\n\n${value.body}`, templateKey: "direct_message", templateVariables: { title: value.title }, mediaUrl: value.mediaUrl || null, status: "delivered", attempts: 1, sentAt: now, nextAttemptAt: now, idempotencyKey: `${batchKey}:${r.id}:in_app` })) });
        } else for (const recipient of recipients) { if (!recipient.phone) continue; await enqueueNotification(tx, { schoolId: session.schoolId, recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone, body: `${value.title}\n\n${value.body}`, templateKey: value.channel === "whatsapp" ? "school_announcement" : undefined, templateVariables: { title: value.title, body: value.body }, mediaUrl: value.mediaUrl }); }
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "message.sent", entityType: "MessageBatch", entityId: `message-${Date.now()}`, after: { title: value.title, audience: value.audience, channel: value.channel, recipientCount: recipients.length } });
        revalidatePath("/school/communications/messages"); revalidatePath("/school/communications/broadcasts"); revalidatePath("/school/communications/announcements");
        return NextResponse.json({ ok: true, message: `Message sent to ${recipients.length} matched recipient${recipients.length === 1 ? "" : "s"}.` });
      });
    }

    if (input?.action === "broadcast") {
      const value = broadcastSchema.parse(input);
      const scheduledAt = value.scheduleAt ? new Date(value.scheduleAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "INVALID_INPUT", message: "Choose a valid schedule time." }, { status: 400 });
      if (scheduledAt && scheduledAt.getTime() <= Date.now()) return NextResponse.json({ error: "INVALID_INPUT", message: "Scheduled broadcast time must be in the future." }, { status: 400 });
      return withTenant(session.schoolId, async (tx) => {
        let recipients: Recipient[] = [];
        if (value.audience === "guardians") recipients = await tx.user.findMany({ where: { status: "active", guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true } });
        else if (value.audience === "teachers") recipients = await tx.user.findMany({ where: { status: "active", userRoles: { some: { role: { key: { in: ["teacher", "class_teacher", "subject_teacher", "academic_coordinator", "department_head"] } } } } }, select: { id: true, name: true, phone: true } });
        else if (value.audience === "staff") recipients = await tx.user.findMany({ where: { status: "active", guardianProfiles: { none: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true } });
        else recipients = await tx.user.findMany({ where: { status: "active" }, select: { id: true, name: true, phone: true } });
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
        return NextResponse.json({ ok: true, message: scheduledAt ? `Broadcast scheduled for ${scheduledAt.toLocaleString("en-GH")}. ${queued} recipient${queued === 1 ? "" : "s"} queued.` : `Broadcast queued for ${queued} recipient${queued === 1 ? "" : "s"}.` });
      });
    }

    if (input?.action === "create_event") {
      const value = eventSchema.parse(input); const start = new Date(value.startDate); const end = new Date(value.endDate);
      return withTenant(session.schoolId, async (tx) => { const year = await tx.academicYear.findFirst({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" } }); if (!year) throw new Error("Create an academic year before creating calendar events."); const event = await createCalendarEvent({ schoolId: session.schoolId, actorId: session.userId, academicYearId: year.id, type: value.type, name: value.name, startDate: start, endDate: end }); await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "event.created", entityType: "CalendarEvent", entityId: event.id, after: { location: value.location || null, description: value.description || null, notifyGuardians: Boolean(value.notifyGuardians), notifyStaff: Boolean(value.notifyStaff) } }); revalidatePath("/school/events"); return NextResponse.json({ ok: true, message: "Event created and added to the school calendar.", event }); });
    }

    if (input?.action === "save_settings") {
      const channels = Array.isArray(input.channels) ? input.channels : ["in_app"];
      return withTenant(session.schoolId, async (tx) => {
        const current = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { notificationChannels: true, whatsappTemplateConfig: true } }); const currentChannels = asRecord(current?.notificationChannels); const nextConfig = { ...asRecord(current?.whatsappTemplateConfig) };
        if (input.whatsappFrom) Object.assign(nextConfig, { from: String(input.whatsappFrom) }); if (input.reportCardMediaBase) Object.assign(nextConfig, { reportCardMediaBase: String(input.reportCardMediaBase) });
        const notificationConfig = { channels, smsCredits: typeof currentChannels.smsCredits === "number" ? currentChannels.smsCredits : 0, automation: { payment_received: Boolean(input.payment_received), report_card_ready: Boolean(input.report_card_ready), student_absence: Boolean(input.student_absence), staff_late: Boolean(input.staff_late), transport_boarding: Boolean(input.transport_boarding), emergency_broadcast: Boolean(input.emergency_broadcast) } };
        await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: { smsSenderId: input.smsSenderId ? String(input.smsSenderId) : undefined, notificationChannels: JSON.parse(JSON.stringify(notificationConfig)) as Prisma.InputJsonValue, whatsappTemplateConfig: JSON.parse(JSON.stringify(nextConfig)) as Prisma.InputJsonValue } });
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "communications.settings_updated", entityType: "SchoolSettings", entityId: session.schoolId, after: JSON.parse(JSON.stringify(notificationConfig)) }); revalidatePath("/school/communications/settings"); return NextResponse.json({ ok: true, message: "Communication settings saved." });
      });
    }
    return NextResponse.json({ error: "INVALID_ACTION", message: "Unsupported communication action." }, { status: 400 });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Please complete the communication details." }, { status: 400 }); if (error instanceof ForbiddenError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status }); return routeError(error); }
}
