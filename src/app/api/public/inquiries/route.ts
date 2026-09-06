import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { RateLimitError } from "@/lib/errors";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(7).max(40).optional().or(z.literal("")),
  subject: z.string().max(180).optional(),
  message: z.string().min(5).max(5000),
  channel: z.string().max(30).default("website"),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const ip = requestIp(request.headers);
    await recordLoginAttempt("public-inquiry", ip, ip);
    if (!input.email && !input.phone) return NextResponse.json({ error: "INVALID_INPUT", message: "Please provide an email address or phone number so we can reply." }, { status: 400 });
    const id = randomUUID();
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "PublicInquiry" ("id","name","email","phone","channel","subject","message") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        id, input.name.trim(), input.email || null, input.phone || null, input.channel, input.subject?.trim() || null, input.message.trim()
      );
    } catch {
      // Database failure while storing a public enquiry is a server problem,
      // not a caller validation problem.
      return NextResponse.json({ error: "INTERNAL_ERROR", message: "We could not send that message. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Thanks. Your message is in our inbox and a real person can follow up from here." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_INPUT", message: "Please check the highlighted fields and try again." }, { status: 400 });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many messages. Try again later." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "We could not send that message. Please try again." }, { status: 500 });
  }
}
