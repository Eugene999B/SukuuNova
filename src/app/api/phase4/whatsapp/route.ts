import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { parentAssistant } from "@/lib/phase4-service";

const schema = z.object({
  schoolId: z.string().min(1),
  phone: z.string().min(7).max(40),
  message: z.string().min(1).max(1000),
  secret: z.string().min(32).max(200),
});

function verifyWebhookSecret(secret: string) {
  const configured = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!configured || configured.length < 32) throw new Error("WhatsApp webhook secret is not configured securely.");
  const supplied = Buffer.from(secret, "utf8");
  const expected = Buffer.from(configured, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    if (!verifyWebhookSecret(input.secret)) {
      return NextResponse.json({ error: "Invalid webhook authentication." }, { status: 401 });
    }
    return NextResponse.json(await parentAssistant(input));
  } catch (error) {
    return routeError(error);
  }
}
