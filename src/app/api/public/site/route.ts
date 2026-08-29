import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "brandName","tagline","supportEmail","supportPhone","whatsappNumber","tiktokHandle","instagramHandle","facebookHandle","linkedinHandle","youtubeHandle","xHandle","websiteUrl","showSocialLinks","showLeadChat" FROM "PlatformPublicSettings" WHERE "id"='default' LIMIT 1`);
  return NextResponse.json(rows[0] ?? { brandName: "SukuuNova", tagline: "A calmer, more connected way to run a school.", showSocialLinks: true, showLeadChat: true });
}
