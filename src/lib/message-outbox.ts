import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { db, withTenant } from "./db";

export type NotificationTemplateKey =
  | "student_absence"
  | "staff_late"
  | "invoice_created"
  | "payment_received"
  | "report_card_ready";

type RecipientType = "guardian" | "staff" | "user";
type Channel = "sms" | "whatsapp";

function configuredChannels(value: Prisma.JsonValue | null | undefined): Channel[] {
  if (!Array.isArray(value)) return ["sms"];
  const channels = value.filter((item): item is Channel => item === "sms" || item === "whatsapp");
  return channels.length ? [...new Set(channels)] : ["sms"];
}

function contentSid(value: Prisma.JsonValue | null | undefined, key: string): string | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, Prisma.JsonValue>)[key];
  if (typeof candidate === "string") return candidate;
  if (candidate && !Array.isArray(candidate) && typeof candidate === "object") {
    const sid = (candidate as Record<string, Prisma.JsonValue>).contentSid;
    return typeof sid === "string" ? sid : undefined;
  }
  return undefined;
}

export async function enqueueNotification(tx: TenantDb, input: {
  schoolId: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientPhone: string;
  body: string;
  templateKey?: NotificationTemplateKey;
  templateVariables?: Record<string, string>;
  mediaUrl?: string;
}) {
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } });
  const channels = configuredChannels(settings?.notificationChannels);
  const messages = [];
  for (const channel of channels) {
    if (channel === "whatsapp" && !input.templateKey) continue;
    messages.push(await tx.message.create({
      data: {
        schoolId: input.schoolId,
        channel,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        recipientPhone: input.recipientPhone,
        body: input.body,
        templateKey: input.templateKey,
        templateVariables: input.templateVariables,
        mediaUrl: input.mediaUrl,
        status: "queued"
      }
    }));
  }
  return messages;
}

export const enqueueSms = enqueueNotification;

export type SmsSender = (input: {
  phone: string;
  body: string;
  senderId?: string;
}) => Promise<void>;

export type WhatsAppSender = (input: {
  phone: string;
  contentSid: string;
  variables: Record<string, string>;
  mediaUrl?: string;
}) => Promise<void>;

export const httpSmsSender: SmsSender = async ({ phone, body, senderId }) => {
  const url = process.env.SMS_PROVIDER_URL;
  const token = process.env.SMS_PROVIDER_TOKEN;
  if (!url || !token) throw new Error("SMS provider is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ to: phone, body, senderId: senderId || process.env.SMS_SENDER_ID })
  });
  if (!response.ok) throw new Error("SMS provider returned HTTP " + response.status);
};

export const twilioWhatsAppSender: WhatsAppSender = async ({
  phone,
  contentSid: sid,
  variables,
  mediaUrl
}) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) throw new Error("Twilio WhatsApp is not configured.");
  const form = new URLSearchParams({
    To: phone.startsWith("whatsapp:") ? phone : "whatsapp:" + phone,
    From: from.startsWith("whatsapp:") ? from : "whatsapp:" + from,
    ContentSid: sid,
    ContentVariables: JSON.stringify(variables)
  });
  if (mediaUrl) form.set("MediaUrl", mediaUrl);
  const response = await fetch(
    "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(accountSid) + "/Messages.json",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64")
      },
      body: form
    }
  );
  if (!response.ok) {
    throw new Error("Twilio WhatsApp returned HTTP " + response.status);
  }
};

function variables(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

export async function processMessageBatchOnce(
  senders: { sms?: SmsSender; whatsapp?: WhatsAppSender } = {
    sms: httpSmsSender,
    whatsapp: twilioWhatsAppSender
  },
  batchSize = 20
) {
  const directories = await db.schoolLoginDirectory.findMany({ where: { status: "active" } });
  let processed = 0;
  for (const directory of directories) {
    if (processed >= batchSize) break;
    const jobs = await withTenant(directory.schoolId, (tx) => tx.message.findMany({
      where: { status: "queued", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: batchSize - processed
    }));
    for (const job of jobs) {
      const claimed = await withTenant(directory.schoolId, (tx) => tx.message.updateMany({
        where: { id: job.id, status: "queued" },
        data: { status: "sending", attempts: { increment: 1 } }
      }));
      if (claimed.count === 0) continue;
      try {
        const settings = await withTenant(directory.schoolId, (tx) =>
          tx.schoolSettings.findUnique({ where: { schoolId: directory.schoolId } })
        );
        if (job.channel === "sms") {
          if (!senders.sms) throw new Error("SMS sender is unavailable.");
          await senders.sms({
            phone: job.recipientPhone,
            body: job.body,
            senderId: settings?.smsSenderId || undefined
          });
        } else if (job.channel === "whatsapp") {
          if (!senders.whatsapp) throw new Error("WhatsApp sender is unavailable.");
          if (!job.templateKey) throw new Error("WhatsApp job has no approved template key.");
          const sid = contentSid(settings?.whatsappTemplateConfig, job.templateKey);
          if (!sid) throw new Error("No Twilio ContentSid is configured for " + job.templateKey + ".");
          await senders.whatsapp({
            phone: job.recipientPhone,
            contentSid: sid,
            variables: variables(job.templateVariables),
            mediaUrl: job.mediaUrl || undefined
          });
        } else {
          throw new Error("Unsupported message channel: " + job.channel);
        }
        await withTenant(directory.schoolId, (tx) => tx.message.update({
          where: { id: job.id },
          data: { status: "sent", sentAt: new Date(), lastError: null }
        }));
      } catch (error) {
        const attempts = job.attempts + 1;
        await withTenant(directory.schoolId, (tx) => tx.message.update({
          where: { id: job.id },
          data: {
            status: attempts >= 5 ? "failed" : "queued",
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown message error",
            nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000)
          }
        }));
      }
      processed++;
    }
  }
  return processed;
}

export async function processSmsBatchOnce(sender: SmsSender = httpSmsSender, batchSize = 20) {
  return processMessageBatchOnce({ sms: sender }, batchSize);
}
