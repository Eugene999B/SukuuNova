import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PUBLIC_SITE = {
  brandName: "SukuuNova",
  tagline: "A calmer, more connected way to run a school.",
  showSocialLinks: true,
  showLeadChat: true,
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "brandName","tagline","supportEmail","supportPhone","whatsappNumber","tiktokHandle","instagramHandle","facebookHandle","linkedinHandle","youtubeHandle","xHandle","websiteUrl","showSocialLinks","showLeadChat" FROM "PlatformPublicSettings" WHERE "id"='default' LIMIT 1`);
    return NextResponse.json(rows[0] ?? DEFAULT_PUBLIC_SITE);
  } catch (error) {
    console.error("Public site settings unavailable; using safe defaults.", error);
    return NextResponse.json(DEFAULT_PUBLIC_SITE);
  }
}
