import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { recordApiAttempt, requestIp } from "@/lib/rate-limit";
import { parentAssistant } from "@/lib/phase4-service";

const MAX_BODY_BYTES = 64 * 1024;
const schema = z.object({
  schoolId: z.string().min(1),
  phone: z.string().min(7).max(40),
  message: z.string().min(1).max(1000),
  secret: z.string().min(32).max(200).optional(),
});

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function schoolWebhookSecret(schoolId: string): string | null {
  // Optional per-school secrets: WHATSAPP_SCHOOL_SECRETS='{"schoolId":"secret..."}'.
  // When a school has its own entry, ONLY that secret authenticates it, so a
  // leaked global secret cannot be reused to read another school's data.
  try {
    const raw = process.env.WHATSAPP_SCHOOL_SECRETS;
    if (!raw) return null;
    const entry = (JSON.parse(raw) as Record<string, unknown>)[schoolId];
    return typeof entry === "string" && entry.length >= 32 ? entry : null;
  } catch {
    return null;
  }
}

function verifyWebhookSecret(schoolId: string, secret: string | undefined) {
  const perSchool = schoolWebhookSecret(schoolId);
  if (perSchool) return Boolean(secret && safeEqual(secret, perSchool));
  const configured = process.env.WHATSAPP_WEBHOOK_SECRET;
  return Boolean(secret && configured && configured.length >= 32 && safeEqual(secret, configured));
}

function verifyMetaSignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || appSecret.length < 32 || !signature) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(signature, expected);
}

/** Meta's one-time webhook subscription challenge. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const configured = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && challenge && configured && configured.length >= 16 && safeEqual(token, configured)) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
    }
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
    }
    const input = schema.parse(JSON.parse(rawBody));
    // AI-backed lookups cost money per request: throttle per school+sender.
    // The IP bucket is generous on purpose — Meta delivers from shared ranges.
    await recordApiAttempt("whatsapp-assistant", `${input.schoolId}:${input.phone}`, requestIp(request.headers), { maxIdentityAttempts: 30, maxIpAttempts: 2000 });
    const metaSignature = request.headers.get("x-hub-signature-256");
    // Once the native Meta app secret is configured, body-secret auth is retired:
    // every delivery must carry a valid Meta signature. Until then, the legacy
    // shared-secret adapter keeps existing integrations working.
    const nativeMode = Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_APP_SECRET.length >= 32);
    const authenticated = nativeMode
      ? verifyMetaSignature(rawBody, metaSignature)
      : metaSignature
        ? verifyMetaSignature(rawBody, metaSignature)
        : verifyWebhookSecret(input.schoolId, input.secret);
    if (!authenticated) {
      return NextResponse.json({ error: "Invalid webhook authentication." }, { status: 401 });
    }
    return NextResponse.json(await parentAssistant({ ...input, secret: process.env.WHATSAPP_WEBHOOK_SECRET ?? "" }));
  } catch (error) {
    return routeError(error);
  }
}
