import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

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
    if (!input.email && !input.phone) return NextResponse.json({ error: "Please provide an email address or phone number so we can reply." }, { status: 400 });
    const id = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO "PublicInquiry" ("id","name","email","phone","channel","subject","message") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      id, input.name.trim(), input.email || null, input.phone || null, input.channel, input.subject?.trim() || null, input.message.trim()
    );
    return NextResponse.json({ ok: true, message: "Thanks. Your message is in our inbox and a real person can follow up from here." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "We could not send that message. Please try again." }, { status: 400 });
  }
}
