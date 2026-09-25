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
export type ArkeselBalanceDetails = {
  providerKey: "arkesel";
  configured: boolean;
  available: boolean;
  balance?: number;
  currency?: string;
  error?: string;
};

export const DEFAULT_SMS_PROVIDER: SmsProviderKey = "arkesel";
const GLOBAL_SMS_SENDER_ID = "SukuuNova";
const PROVIDERS: Array<{ key: SmsProviderKey; label: string; detail: string }> = [
  { key: "arkesel", label: "Arkesel", detail: "Default Ghana/Africa SMS provider." },
  { key: "sailup", label: "Sailup", detail: "Low-cost Ghana SMS alternative." },
  { key: "hubtel", label: "Hubtel", detail: "High-throughput Ghana routing alternative." },
  { key: "generic", label: "Generic HTTP", detail: "Legacy/custom JSON SMS gateway adapter." },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function firstRecord(value: unknown) {
  return Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
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
    senderId: GLOBAL_SMS_SENDER_ID,
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
function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}
function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== undefined) return number;
  }
  return undefined;
}
function arkeselBalanceUrl() {
  const configuredUrl = process.env.ARKESEL_SMS_URL || "https://sms.arkesel.com/api/v2/sms/send";
  try {
    return new URL("/api/v2/clients/balance-details", configuredUrl).toString();
  } catch {
    return "https://sms.arkesel.com/api/v2/clients/balance-details";
  }
}

export function getArkeselSmsDeliveryCallbackUrl() {
  const explicitBase = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  const railwayBase = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;
  const base = explicitBase || railwayBase;
  if (!base) return undefined;
  try {
    return new URL("/api/webhooks/arkesel/sms-delivery", base).toString();
  } catch {
    return undefined;
  }
}

export async function getArkeselBalanceDetails(): Promise<ArkeselBalanceDetails> {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) return { providerKey: "arkesel", configured: false, available: false, error: "Arkesel API key is not configured." };
  try {
    const response = await fetch(arkeselBalanceUrl(), { signal: AbortSignal.timeout(15_000), method: "GET", headers: { "api-key": apiKey } });
    const body = await jsonResponse(response);
    if (!response.ok) return { providerKey: "arkesel", configured: true, available: false, error: `Arkesel balance HTTP ${response.status}` };
    const data = firstRecord(body.data);
    const balanceDetails = asRecord(data.balance_details ?? body.balance_details);
    const balance = firstNumber(
      data.balance,
      data.sms_balance,
      data.smsBalance,
      data.credit_balance,
      data.creditBalance,
      balanceDetails.balance,
      balanceDetails.sms_balance,
      balanceDetails.smsBalance,
      body.balance,
      body.sms_balance,
      body.smsBalance,
    );
    const currency = firstString(data.currency, balanceDetails.currency, body.currency);
    if (balance === undefined) return { providerKey: "arkesel", configured: true, available: false, currency, error: "Arkesel balance response did not include a numeric SMS balance." };
    return { providerKey: "arkesel", configured: true, available: true, balance, currency };
  } catch (error) {
    return { providerKey: "arkesel", configured: true, available: false, error: error instanceof Error ? error.message : "Unable to load Arkesel balance." };
  }
}

export async function sendSmsThroughProvider(providerKey: SmsProviderKey, input: SmsSendInput): Promise<SmsSendResult> {
  // SukuuNova uses one platform sender ID. Tenant/school sender IDs are intentionally ignored.
  const sender = GLOBAL_SMS_SENDER_ID;

  if (providerKey === "arkesel") {
    const apiKey = process.env.ARKESEL_API_KEY;
    if (!apiKey) throw new Error("Arkesel SMS is not configured.");
    const callbackUrl = getArkeselSmsDeliveryCallbackUrl();
    const response = await fetch(process.env.ARKESEL_SMS_URL || "https://sms.arkesel.com/api/v2/sms/send", {
      signal: AbortSignal.timeout(15_000),
      method: "POST",
      headers: { "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ sender, message: input.body, recipients: [input.phone], ...(callbackUrl ? { callback_url: callbackUrl } : {}) }),
    });
    const body = await jsonResponse(response);
    if (!response.ok || (typeof body.status === "string" && body.status.toLowerCase() === "error")) throw new Error(`Arkesel SMS HTTP ${response.status}`);
    const data = firstRecord(body.data);
    return {
      providerKey,
      providerMessageId: firstString(data.id, data.message_id, data.sms_id, body.id, body.message_id, body.sms_id),
      creditsUsed: positiveInt(data.credits_used ?? body.credits_used),
    };
  }

  if (providerKey === "sailup") {
    const apiKey = process.env.SAILUP_API_KEY;
    if (!apiKey) throw new Error("Sailup SMS is not configured.");
    const response = await fetch(process.env.SAILUP_SMS_URL || "https://api.sailup.io/v1/sms/", {
      signal: AbortSignal.timeout(15_000),
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
      signal: AbortSignal.timeout(15_000),
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      body: JSON.stringify({ from: sender, to: input.phone, content: input.body }),
    });
    const body = await jsonResponse(response);
    if (!response.ok) throw new Error(`Hubtel SMS HTTP ${response.status}`);
    const data = firstRecord(body.data);
    // Hubtel's rate fields represent monetary routing price, not an SMS-segment quantity.
    // Keep provider credit usage unset unless Hubtel exposes a documented segment count.
    return { providerKey, providerMessageId: firstString(data.messageId, data.message_id, body.messageId, body.message_id) };
  }

  const url = process.env.SMS_PROVIDER_URL, token = process.env.SMS_PROVIDER_TOKEN;
  if (!url || !token) throw new Error("Generic SMS provider is not configured.");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ to: input.phone, body: input.body, senderId: sender }) });
  const body = await jsonResponse(response);
  if (!response.ok) throw new Error(`SMS provider HTTP ${response.status}`);
  return { providerKey, providerMessageId: firstString(body.id, body.messageId, body.message_id), creditsUsed: positiveInt(body.creditsUsed ?? body.credits_used ?? body.quantity) };
}

export async function sendSmsThroughActiveProvider(input: SmsSendInput) {
  const providerKey = await getActiveSmsProviderKey();
  return sendSmsThroughProvider(providerKey, input);
}
