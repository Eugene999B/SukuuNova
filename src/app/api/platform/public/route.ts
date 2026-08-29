import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError, UnauthorizedError, ForbiddenError } from "@/lib/errors";

const settingsSchema = z.object({
  brandName: z.string().min(2).max(100), tagline: z.string().min(2).max(220), supportEmail: z.string().email().optional().or(z.literal("")),
  supportPhone: z.string().max(40).optional(), whatsappNumber: z.string().max(40).optional(), tiktokHandle: z.string().max(100).optional(),
  instagramHandle: z.string().max(100).optional(), facebookHandle: z.string().max(100).optional(), linkedinHandle: z.string().max(100).optional(),
  youtubeHandle: z.string().max(100).optional(), xHandle: z.string().max(100).optional(), websiteUrl: z.string().url().optional().or(z.literal("")),
  showSocialLinks: z.boolean(), showLeadChat: z.boolean()
});

export async function GET() {
  try {
    const session = await getPlatformSession(); if (!session) throw new UnauthorizedError();
    if (!["super_admin","platform_admin","support_admin"].includes(session.role)) throw new ForbiddenError();
    const [settings, inquiries] = await Promise.all([
      db.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "PlatformPublicSettings" WHERE "id"='default' LIMIT 1`),
      db.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","name","email","phone","channel","subject","message","status","createdAt","repliedAt","repliedVia" FROM "PublicInquiry" ORDER BY "createdAt" DESC LIMIT 100`)
    ]);
    return NextResponse.json({ settings: settings[0] ?? null, inquiries });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await getPlatformSession(); if (!session) throw new UnauthorizedError();
    if (session.role !== "super_admin" && session.role !== "platform_admin") throw new ForbiddenError();
    const input = settingsSchema.parse(await request.json());
    await db.$executeRawUnsafe(`UPDATE "PlatformPublicSettings" SET "brandName"=$1,"tagline"=$2,"supportEmail"=$3,"supportPhone"=$4,"whatsappNumber"=$5,"tiktokHandle"=$6,"instagramHandle"=$7,"facebookHandle"=$8,"linkedinHandle"=$9,"youtubeHandle"=$10,"xHandle"=$11,"websiteUrl"=$12,"showSocialLinks"=$13,"showLeadChat"=$14,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"='default'`, input.brandName.trim(), input.tagline.trim(), input.supportEmail || null, input.supportPhone || null, input.whatsappNumber || null, input.tiktokHandle || null, input.instagramHandle || null, input.facebookHandle || null, input.linkedinHandle || null, input.youtubeHandle || null, input.xHandle || null, input.websiteUrl || null, input.showSocialLinks, input.showLeadChat);
    await db.$executeRawUnsafe(`INSERT INTO "AuditLogPlatform" ("id","actorId","action","targetEntity","meta") VALUES (gen_random_uuid()::text,$1,'platform_public_settings.updated','PlatformPublicSettings:default',$2)`, session.adminId, JSON.stringify({fields:Object.keys(input)}));
    return NextResponse.json({ ok: true, message: "Public presence updated." });
  } catch (error) { return routeError(error); }
}
