import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const patchSchema = z.object({
  school: z.object({ name: z.string().trim().min(2).max(160), uniqueCode: z.string().trim().min(2).max(80) }).optional(),
  settings: z.object({
    expectedResumptionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    attendanceGraceMinutes: z.number().int().min(0).max(180),
    timezone: z.string().min(1).max(80),
    gradeCaWeight: z.number().min(0).max(100),
    gradeExamWeight: z.number().min(0).max(100),
    allowPartialReportCards: z.boolean(),
    smsSenderId: z.string().max(20).optional()
  }).optional()
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      const [school, settings, academicYears, terms] = await Promise.all([
        tx.school.findUnique({ where: { id: session.schoolId }, select: { id: true, name: true, uniqueCode: true, status: true } }),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } }),
        tx.academicYear.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" } }),
        tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: { select: { id: true, name: true, startDate: true, endDate: true } } }, orderBy: [{ startDate: "desc" }, { name: "asc" }] })
      ]);
      if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
      return { school, settings, academicYears, terms };
    });
    const now = new Date();
    return NextResponse.json({ ...data, terms: data.terms.map((term) => ({ ...term, status: now < term.startDate ? "upcoming" : now > term.endDate ? "completed" : "current" })) });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, patchSchema);
    if (input.settings && Math.abs(input.settings.gradeCaWeight + input.settings.gradeExamWeight - 100) > 0.001) {
      throw new AppError("CA and exam weights must total 100.", 400, "INVALID_GRADE_WEIGHTS");
    }
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const beforeSchool = await tx.school.findUnique({ where: { id: session.schoolId } });
      const beforeSettings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId } });
      let school = beforeSchool;
      if (input.school) {
        const uniqueCode = input.school.uniqueCode.trim().toLowerCase();
        school = await tx.school.update({ where: { id: session.schoolId }, data: { name: input.school.name, uniqueCode } });
        await tx.schoolLoginDirectory.upsert({
          where: { schoolId: session.schoolId },
          update: { uniqueCode, status: school.status === "active" ? "active" : "inactive" },
          create: { schoolId: session.schoolId, uniqueCode, status: school.status === "active" ? "active" : "inactive" },
        });
      }
      const settings = input.settings ? await tx.schoolSettings.update({ where: { schoolId: session.schoolId }, data: input.settings }) : beforeSettings;
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "settings.school_workspace_updated", entityType: "SchoolSettings", entityId: session.schoolId, before: { school: beforeSchool, settings: beforeSettings }, after: { school, settings } });
      return { school, settings };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return routeError(error); }
}
