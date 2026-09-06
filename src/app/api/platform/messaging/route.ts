import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { getPlatformSchoolScope } from "@/lib/platform-permissions";
import { db, withTenant } from "@/lib/db";
import { routeError, ForbiddenError } from "@/lib/errors";
import { appendPlatformAudit } from "@/lib/audit";

const schema = z.object({ action: z.literal("send"), schoolIds: z.array(z.string().min(1)).min(1).max(200), audience: z.enum(["individual", "guardians", "teachers", "staff", "all"]), userIds: z.array(z.string().min(1)).max(1000).optional(), channel: z.enum(["in_app", "sms", "whatsapp"]), title: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(5000), mediaUrl: z.string().url().max(2000).optional() });
function requireProvider(channel: "sms" | "whatsapp") { if (channel === "sms" && (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN)) throw new Error("SMS is not configured on the SukuuNova platform."); if (channel === "whatsapp" && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM)) throw new Error("WhatsApp is not configured on the SukuuNova platform."); }
function metadata(title:string,session:{adminId:string;name:string}) { return JSON.parse(JSON.stringify({title,senderType:"platform_admin",senderId:session.adminId,senderName:session.name,attachments:[]})); }

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "support.manage");
    const scope = await getPlatformSchoolScope(session);
    const schools = session.role === "super_admin" ? await db.school.findMany({ where: { status: "active" }, select: { id: true, name: true, uniqueCode: true }, orderBy: { name: "asc" }, take: 200 }) : await db.school.findMany({ where: { id: { in: scope || [] }, status: "active" }, select: { id: true, name: true, uniqueCode: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ schools });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "support.manage");
    const input = schema.parse(await request.json());
    const scope = await getPlatformSchoolScope(session);
    if (session.role !== "super_admin" && input.schoolIds.some((id) => !scope?.includes(id))) throw new ForbiddenError("One or more selected schools are outside your platform assignment.");
    if (input.channel !== "in_app") requireProvider(input.channel);
    if (input.audience === "individual" && !input.userIds?.length) return NextResponse.json({ error: "INVALID_INPUT", message: "Choose at least one recipient." }, { status: 400 });
    let delivered = 0, queued = 0, matched = 0;
    for (const schoolId of input.schoolIds) {
      const result = await withTenant(schoolId, async (tx) => {
        let recipients = [] as Array<{id:string;name:string;phone:string|null}>;
        if (input.audience === "individual") recipients = await tx.user.findMany({ where: { schoolId, status: "active", id: { in: input.userIds || [] } }, select: { id: true, name: true, phone: true } });
        else if (input.audience === "guardians") recipients = await tx.user.findMany({ where: { schoolId, status: "active", guardianProfiles: { some: { schoolId } } }, select: { id: true, name: true, phone: true }, take: 1000 });
        else if (input.audience === "teachers") recipients = await tx.user.findMany({ where: { schoolId, status: "active", userRoles: { some: { role: { key: { in: ["teacher","class_teacher","subject_teacher","academic_coordinator","department_head"] } } } } }, select: { id: true, name: true, phone: true }, take: 1000 });
        else if (input.audience === "staff") recipients = await tx.user.findMany({ where: { schoolId, status: "active", guardianProfiles: { none: { schoolId } } }, select: { id: true, name: true, phone: true }, take: 1000 });
        else recipients = await tx.user.findMany({ where: { schoolId, status: "active" }, select: { id: true, name: true, phone: true }, take: 1000 });
        let localDelivered=0, localQueued=0;
        for (const recipient of recipients) {
          const common = { schoolId, recipientType: "user", recipientId: recipient.id, recipientPhone: recipient.phone || "", body: `${input.title}\n\n${input.body}`, templateKey: input.channel === "whatsapp" ? "school_announcement" : null, templateVariables: metadata(input.title, session), mediaUrl: input.mediaUrl || null, idempotencyKey: `platform:${session.adminId}:${schoolId}:${recipient.id}:${input.channel}:${Date.now()}:${randomBytes(5).toString("hex")}` };
          if (input.channel === "in_app") { await tx.message.create({ data: { ...common, status: "delivered", attempts: 1, sentAt: new Date(), nextAttemptAt: new Date() } }); localDelivered++; }
          else if (recipient.phone) { await tx.message.create({ data: { ...common, status: "queued", attempts: 0, nextAttemptAt: new Date() } }); localQueued++; }
        }
        return { matched: recipients.length, localDelivered, localQueued };
      });
      matched += result.matched; delivered += result.localDelivered; queued += result.localQueued;
      await appendPlatformAudit({ actorId: session.adminId, action: "platform.message.sent", targetSchoolId: schoolId, targetEntity: "MessageBatch", meta: { audience: input.audience, channel: input.channel, matched: result.matched, delivered: result.localDelivered, queued: result.localQueued } });
    }
    return NextResponse.json({ ok:true, matched, delivered, queued, message: input.channel === "in_app" ? `Delivered ${delivered} platform message${delivered===1?"":"s"}.` : `Queued ${queued} ${input.channel.toUpperCase()} delivery${queued===1?"":"ies"}.` });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({error:"INVALID_INPUT",message:"Check the schools, audience, channel and message."},{status:400}); if(error instanceof ForbiddenError)return NextResponse.json({error:error.code,message:error.message},{status:error.status}); if(error instanceof Error&&/not configured/i.test(error.message))return NextResponse.json({error:"NOTIFICATION_PROVIDER_UNAVAILABLE",message:error.message},{status:503}); return routeError(error); }
}
