import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { routeError } from "@/lib/errors";
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

function verifyWebhookSecret(secret: string | undefined) {
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
    const metaSignature = request.headers.get("x-hub-signature-256");
    // Accept the existing shared-secret adapter only when a Meta signature is
    // absent. Native Meta traffic must prove possession of the app secret.
    const authenticated = metaSignature
      ? verifyMetaSignature(rawBody, metaSignature)
      : verifyWebhookSecret(input.secret);
    if (!authenticated) {
      return NextResponse.json({ error: "Invalid webhook authentication." }, { status: 401 });
    }
    return NextResponse.json(await parentAssistant({ ...input, secret: process.env.WHATSAPP_WEBHOOK_SECRET ?? "" }));
  } catch (error) {
    return routeError(error);
  }
}
