import { db } from "./db";

export type SmsProviderKey = "arkesel" | "sailup" | "hubtel" | "generic";
export type SmsProviderReadiness = {
  key: SmsProviderKey;
  label: string;
  configured: boolean;
  default: boolean;
  detail: string;
};
export type SmsSendResult = { providerKey: SmsProviderKey; providerMessageId?: string; creditsUsed?: number };
export type SmsSendInput = { phone: string; body: string; senderId?: string };

export const DEFAULT_SMS_PROVIDER: SmsProviderKey = "arkesel";
const PROVIDERS: Array<{ key: SmsProviderKey; label: string; detail: string }> = [
  { key: "arkesel", label: "Arkesel", detail: "Default Ghana/Africa SMS provider." },
  { key: "sailup", label: "Sailup", detail: "Low-cost Ghana SMS alternative." },
  { key: "hubtel", label: "Hubtel", detail: "High-throughput Ghana routing alternative." },
  { key: "generic", label: "Generic HTTP", detail: "Legacy/custom JSON SMS gateway adapter." },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parseProvider(value: unknown): SmsProviderKey | null {
  return value === "arkesel" || value === "sailup" || value === "hubtel" || value === "generic" ? value : null;
}
function configured(key: SmsProviderKey) {
  if (key === "arkesel") return Boolean(process.env.ARKESEL_API_KEY);
  if (key === "sailup") return Boolean(process.env.SAILUP_API_KEY);
  if (key === "hubtel") return Boolean(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
  return Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_TOKEN);
}

export async function getActiveSmsProviderKey(): Promise<SmsProviderKey> {
  const rows = await db.$queryRawUnsafe<Array<{ value: unknown }>>(`SELECT "value" FROM "PlatformConfiguration" WHERE "key"='platform.messaging' LIMIT 1`);
  const messaging = asRecord(rows[0]?.value);
  return parseProvider(messaging.smsProvider) ?? DEFAULT_SMS_PROVIDER;
}

export async function getSmsProviderReadiness() {
  const activeProvider = await getActiveSmsProviderKey();
  return {
    activeProvider,
    providers: PROVIDERS.map((provider): SmsProviderReadiness => ({
      ...provider,
      configured: configured(provider.key),
      default: provider.key === DEFAULT_SMS_PROVIDER,
    })),
    senderConfigured: Boolean(process.env.SMS_SENDER_ID),
  };
}

export async function isActiveSmsProviderConfigured() {
  const key = await getActiveSmsProviderKey();
  return configured(key);
}

async function jsonResponse(response: Response) {
  const body: unknown = await response.json().catch(() => ({}));
  return asRecord(body);
}
function positiveInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function sendSmsThroughProvider(providerKey: SmsProviderKey, input: SmsSendInput): Promise<SmsSendResult> {
  const sender = input.senderId || process.env.SMS_SENDER_ID || "SukuuNova";

  if (providerKey === "arkesel") {
    const apiKey = process.env.ARKESEL_API_KEY;
    if (!apiKey) throw new Error("Arkesel SMS is not configured.");
    const response = await fetch(process.env.ARKESEL_SMS_URL || "https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ sender, message: input.body, recipients: [input.phone] }),
    });
    const body = await jsonResponse(response);
    if (!response.ok || (typeof body.status === "string" && body.status.toLowerCase() === "error")) throw new Error(`Arkesel SMS HTTP ${response.status}`);
    const data = asRecord(body.data);
    return { providerKey, providerMessageId: firstString(data.id, data.message_id, body.id), creditsUsed: positiveInt(data.credits_used ?? body.credits_used) };
  }

  if (providerKey === "sailup") {
    const apiKey = process.env.SAILUP_API_KEY;
    if (!apiKey) throw new Error("Sailup SMS is not configured.");
    const response = await fetch(process.env.SAILUP_SMS_URL || "https://api.sailup.io/v1/sms/", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: sender, to: [input.phone], body: input.body }),
    });
    const body = await jsonResponse(response);
    if (!response.ok) throw new Error(`Sailup SMS HTTP ${response.status}`);
    return { providerKey, providerMessageId: firstString(body.id), creditsUsed: positiveInt(body.quantity) };
  }

  if (providerKey === "hubtel") {
    const clientId = process.env.HUBTEL_CLIENT_ID, clientSecret = process.env.HUBTEL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Hubtel SMS is not configured.");
    const response = await fetch(process.env.HUBTEL_SMS_URL || "https://smsc.hubtel.com/v1/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      body: JSON.stringify({ from: sender, to: input.phone, content: input.body }),
    });
    const body = await jsonResponse(response);
    if (!response.ok) throw new Error(`Hubtel SMS HTTP ${response.status}`);
    const data = asRecord(body.data);
    return { providerKey, providerMessageId: firstString(data.messageId, data.message_id, body.messageId, body.message_id), creditsUsed: positiveInt(data.rate ?? body.rate) };
  }

  const url = process.env.SMS_PROVIDER_URL, token = process.env.SMS_PROVIDER_TOKEN;
  if (!url || !token) throw new Error("Generic SMS provider is not configured.");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ to: input.phone, body: input.body, senderId: sender }) });
  const body = await jsonResponse(response);
  if (!response.ok) throw new Error(`SMS provider HTTP ${response.status}`);
  return { providerKey, providerMessageId: firstString(body.id, body.messageId, body.message_id), creditsUsed: positiveInt(body.creditsUsed ?? body.credits_used ?? body.quantity) };
}

export async function sendSmsThroughActiveProvider(input: SmsSendInput) {
  const providerKey = await getActiveSmsProviderKey();
  return sendSmsThroughProvider(providerKey, input);
}
