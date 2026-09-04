import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { appendPlatformAudit } from "@/lib/audit";

const preferencesSchema = z.object({
  defaultLanding: z.enum(["/platform", "/platform/schools", "/platform/audit", "/platform/billing"]),
  timezone: z.string().min(3).max(80),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  timeFormat: z.enum(["12h", "24h"]),
  compactInterface: z.boolean(),
  reduceMotion: z.boolean(),
  notifySecurity: z.boolean(),
  notifyBilling: z.boolean(),
  notifySupport: z.boolean(),
  notifySystem: z.boolean(),
});

export async function GET() {
  try {
    const session = await requirePlatformSession();
    const admin = await db.platformAdmin.findUnique({ where: { id: session.adminId }, select: { id: true, name: true, email: true, role: true, status: true } });
    if (!admin || admin.status !== "active") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const rows = await db.$queryRawUnsafe<Array<{ preferences: Record<string, unknown> }>>(`SELECT "preferences" FROM "PlatformAdminMeta" WHERE "adminId"=$1 LIMIT 1`, session.adminId);
    return NextResponse.json({ admin, preferences: rows[0]?.preferences ?? { defaultLanding: "/platform", timezone: "Africa/Accra", dateFormat: "DD/MM/YYYY", timeFormat: "24h", compactInterface: false, reduceMotion: false, notifySecurity: true, notifyBilling: true, notifySupport: true, notifySystem: true } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const preferences = preferencesSchema.parse(await request.json());
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminMeta" ("adminId","preferences") VALUES ($1,$2::jsonb) ON CONFLICT ("adminId") DO UPDATE SET "preferences"=EXCLUDED."preferences"`, session.adminId, JSON.stringify(preferences));
      await appendPlatformAudit({ actorId: session.adminId, action: "platform_admin.preferences.updated", targetEntity: `PlatformAdmin:${session.adminId}`, meta: preferences }, tx);
    });
    return NextResponse.json({ ok: true, preferences });
  } catch (error) { return routeError(error); }
}
