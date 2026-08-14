import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { selectReportTemplate, templateGallery } from "@/lib/template-service";

const schema = z.object({
  templateId: z.string(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  watermark: z.string().max(36).optional(),
  logoDataUrl: z.string().max(1_500_000).optional()
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "templates:manage");
      const [templates, settings, school] = await Promise.all([
        templateGallery(tx),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } }),
        tx.school.findFirst({ select: { logoUrl: true, brandColors: true } })
      ]);
      return { templates, settings, school };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) =>
      selectReportTemplate(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        ...input
      })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
