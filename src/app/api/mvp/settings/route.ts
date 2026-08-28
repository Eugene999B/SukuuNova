import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  expectedResumptionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  attendanceGraceMinutes: z.number().int().min(0).max(180),
  timezone: z.string().min(1).max(80),
  gradeCaWeight: z.number().min(0).max(100),
  gradeExamWeight: z.number().min(0).max(100),
  allowPartialReportCards: z.boolean(),
  smsSenderId: z.string().max(20).optional()
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const settings = await withTenant(session.schoolId, (tx) =>
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } })
    );
    return NextResponse.json({ settings });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    if (Math.abs(input.gradeCaWeight + input.gradeExamWeight - 100) > 0.001) {
      throw new AppError("CA and exam weights must total 100.", 400, "INVALID_GRADE_WEIGHTS");
    }
    const settings = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
      const updated = await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: input });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId, actorId: session.userId, action: "settings.phase1_updated",
        entityType: "SchoolSettings", entityId: session.schoolId, before, after: updated
      });
      return updated;
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) { return routeError(error); }
}
