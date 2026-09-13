import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { parseJson } from "@/lib/http";
import { routeError, AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  academicYearId: z.string().min(1),
  classSectionId: z.string().min(1),
  userId: z.string().min(1).nullable(),
});

type SectionRow = { id: string; academicYearId: string; classId: string; displayName: string; sectionCode: string; gradeName: string; pathwayName: string | null; classTeacherId: string | null; classTeacherName: string | null };

async function payload(tx: TenantDb, schoolId: string, requestedYearId?: string | null) {
  const [years, staff] = await Promise.all([
    tx.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true } }),
    tx.user.findMany({ where: { schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, userRoles: { select: { role: { select: { name: true } } } } } }),
  ]);
  const now = new Date();
  const year = years.find((item) => item.id === requestedYearId) ?? years.find((item) => item.startDate <= now && item.endDate >= now) ?? years[0] ?? null;
  const sections = year ? await tx.$queryRawUnsafe<SectionRow[]>(
    `SELECT cs."id",cs."academicYearId",cs."classId",cs."displayName",cs."sectionCode",gl."name" AS "gradeName",p."name" AS "pathwayName",
            a."userId" AS "classTeacherId",u."name" AS "classTeacherName"
       FROM "ClassSection" cs
       JOIN "GradeLevel" gl ON gl."id"=cs."gradeLevelId" AND gl."schoolId"=cs."schoolId"
       LEFT JOIN "AcademicPathway" p ON p."id"=cs."pathwayId" AND p."schoolId"=cs."schoolId"
       LEFT JOIN "ClassSectionStaffAssignment" a ON a."schoolId"=cs."schoolId" AND a."classSectionId"=cs."id"
         AND a."academicYearId"=cs."academicYearId" AND a."status"='active' AND a."responsibility"='class_teacher' AND a."isPrimary"=true
       LEFT JOIN "User" u ON u."id"=a."userId" AND u."schoolId"=a."schoolId"
      WHERE cs."schoolId"=$1 AND cs."academicYearId"=$2 AND cs."isActive"=true
      ORDER BY gl."sequence",cs."sectionCode",cs."displayName"`, schoolId, year.id) : [];
  return {
    years: years.map((item) => ({ ...item, startDate: item.startDate.toISOString(), endDate: item.endDate.toISOString() })),
    selectedYearId: year?.id ?? null,
    sections,
    staff: staff.map((person) => ({ id: person.id, name: person.name, roles: person.userRoles.map((item) => item.role.name) })),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "classes:manage");
      return NextResponse.json(await payload(tx, session.schoolId, url.searchParams.get("academicYearId")), { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "classes:manage");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`class-section-teacher:${session.schoolId}:${input.classSectionId}`}))`;
      const sections = await tx.$queryRawUnsafe<Array<{ id: string; classId: string; academicYearId: string }>>(
        `SELECT "id","classId","academicYearId" FROM "ClassSection" WHERE "schoolId"=$1 AND "id"=$2 AND "academicYearId"=$3 AND "isActive"=true LIMIT 1`,
        session.schoolId, input.classSectionId, input.academicYearId,
      );
      const section = sections[0];
      if (!section) throw new AppError("Class section not found in the selected academic year.", 404, "CLASS_SECTION_NOT_FOUND");
      if (input.userId) {
        const user = await tx.user.findFirst({ where: { id: input.userId, schoolId: session.schoolId, status: "active" }, select: { id: true } });
        if (!user) throw new AppError("Choose an active staff member from this school.", 400, "INVALID_CLASS_TEACHER");
      }
      const beforeRows = await tx.$queryRawUnsafe<Array<{ id: string; userId: string }>>(
        `SELECT "id","userId" FROM "ClassSectionStaffAssignment" WHERE "schoolId"=$1 AND "classSectionId"=$2 AND "status"='active' AND "responsibility"='class_teacher' AND "isPrimary"=true`,
        session.schoolId, input.classSectionId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "ClassSectionStaffAssignment" SET "status"='ended',"endedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "schoolId"=$1 AND "classSectionId"=$2 AND "status"='active' AND "responsibility"='class_teacher' AND "isPrimary"=true`,
        session.schoolId, input.classSectionId,
      );
      let assignmentId: string | null = null;
      if (input.userId) {
        assignmentId = createId();
        await tx.$executeRawUnsafe(
          `INSERT INTO "ClassSectionStaffAssignment" ("id","schoolId","academicYearId","classSectionId","userId","responsibility","isPrimary","status") VALUES ($1,$2,$3,$4,$5,'class_teacher',true,'active')`,
          assignmentId, session.schoolId, input.academicYearId, input.classSectionId, input.userId,
        );
      }
      const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: session.schoolId }, select: { startDate: true, endDate: true, isLocked: true } });
      const now = new Date();
      if (year && !year.isLocked && year.startDate <= now && year.endDate >= now) {
        await tx.class.updateMany({ where: { id: section.classId, schoolId: session.schoolId }, data: { classTeacherId: input.userId } });
      }
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "academic_structure.class_teacher_assigned",
        entityType: "ClassSection",
        entityId: input.classSectionId,
        before: { userId: beforeRows[0]?.userId ?? null },
        after: { userId: input.userId, academicYearId: input.academicYearId, assignmentId },
      });
      return NextResponse.json({ ok: true, data: await payload(tx, session.schoolId, input.academicYearId) });
    });
  } catch (error) { return routeError(error); }
}
