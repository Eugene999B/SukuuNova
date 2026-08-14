import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  faceMatchThreshold: z.number().min(80).max(100),
  substituteLateMinutes: z.number().int().min(0).max(180),
  notificationChannels: z.array(z.enum(["sms", "whatsapp"])).min(1),
  whatsappTemplateConfig: z.record(z.string().min(2)).optional()
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const settings = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      return tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
    });
    return NextResponse.json({ settings });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
      const settings = await tx.schoolSettings.update({
        where: { schoolId: session.schoolId },
        data: input
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "phase2.settings_updated",
        entityType: "SchoolSettings",
        entityId: session.schoolId,
        before,
        after: settings
      });
      return settings;
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
