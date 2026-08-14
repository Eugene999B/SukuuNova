import type { TenantDb } from "./db";
import { db, withTenant } from "./db";

export async function enqueueSms(tx: TenantDb, input: {
  schoolId: string; recipientType: "guardian" | "staff" | "user"; recipientId: string;
  recipientPhone: string; body: string;
}) {
  return tx.message.create({ data: {
    schoolId: input.schoolId, channel: "sms", recipientType: input.recipientType,
    recipientId: input.recipientId, recipientPhone: input.recipientPhone,
    body: input.body, status: "queued"
  }});
}

export type SmsSender = (input: { phone: string; body: string; senderId?: string }) => Promise<void>;

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

export async function processSmsBatchOnce(sender: SmsSender = httpSmsSender, batchSize = 20) {
  const directories = await db.schoolLoginDirectory.findMany({ where: { status: "active" } });
  let processed = 0;
  for (const directory of directories) {
    if (processed >= batchSize) break;
    const jobs = await withTenant(directory.schoolId, (tx) => tx.message.findMany({
      where: { status: "queued", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" }, take: batchSize - processed
    }));
    for (const job of jobs) {
      const claimed = await withTenant(directory.schoolId, (tx) => tx.message.updateMany({
        where: { id: job.id, status: "queued" },
        data: { status: "sending", attempts: { increment: 1 } }
      }));
      if (claimed.count === 0) continue;
      try {
        const senderId = await withTenant(directory.schoolId, async (tx) =>
          (await tx.schoolSettings.findUnique({ where: { schoolId: directory.schoolId } }))?.smsSenderId || undefined
        );
        await sender({ phone: job.recipientPhone, body: job.body, senderId });
        await withTenant(directory.schoolId, (tx) => tx.message.update({
          where: { id: job.id }, data: { status: "sent", sentAt: new Date(), lastError: null }
        }));
      } catch (error) {
        const attempts = job.attempts + 1;
        await withTenant(directory.schoolId, (tx) => tx.message.update({
          where: { id: job.id }, data: {
            status: attempts >= 5 ? "failed" : "queued",
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown SMS error",
            nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000)
          }
        }));
      }
      processed++;
    }
  }
  return processed;
}
