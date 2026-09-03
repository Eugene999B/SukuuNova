import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError, ForbiddenError, AppError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";

const schema = z.object({ adminId: z.string().min(1), schoolIds: z.array(z.string().min(1)).max(200) });

type Worker = { id: string; name: string; email: string; role: string; status: string };
type School = { id: string; name: string; uniqueCode: string; status: string };
type AccessRow = { adminId: string; schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null };

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "admins.view");
    const [workers, schools, accessRows] = await Promise.all([
      db.$queryRawUnsafe<Worker[]>(`SELECT "id","name","email","role","status" FROM "PlatformAdmin" ORDER BY "name" ASC`),
      db.$queryRawUnsafe<School[]>(`SELECT "id","name","uniqueCode","status" FROM "School" ORDER BY "name" ASC`),
      db.$queryRawUnsafe<AccessRow[]>(`SELECT a."adminId",a."schoolId",s."name" AS "schoolName",s."uniqueCode",s."status" FROM "PlatformAdminSchoolAccess" a LEFT JOIN "School" s ON s."id"=a."schoolId" ORDER BY s."name" ASC`),
    ]);
    const access: Record<string, Array<{ schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null }>> = {};
    for (const worker of workers) access[worker.id] = [];
    for (const row of accessRows) access[row.adminId]?.push({ schoolId: row.schoolId, schoolName: row.schoolName, uniqueCode: row.uniqueCode, status: row.status });
    return NextResponse.json({ workers, schools, access });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "admins.manage");
    if (session.role !== "super_admin") throw new ForbiddenError("Only Super Admin can change worker school scope.");
    const input = schema.parse(await request.json());
    const schoolIds = [...new Set(input.schoolIds)];
    const admin = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "PlatformAdmin" WHERE "id"=$1 LIMIT 1`, input.adminId);
    if (!admin[0]) throw new AppError("Worker account was not found.", 404, "WORKER_NOT_FOUND");
    const validSchools = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "School" WHERE "id" = ANY($1::text[])`, schoolIds);
    if (validSchools.length !== schoolIds.length) throw new AppError("One or more selected schools do not exist.", 400, "INVALID_SCHOOL_SCOPE");
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`DELETE FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1`, input.adminId);
      for (const schoolId of schoolIds) {
        await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminSchoolAccess" ("adminId","schoolId","createdById") VALUES ($1,$2,$3)`, input.adminId, schoolId, session.adminId);
      }
    });
    await db.$executeRawUnsafe(`INSERT INTO "AuditLogPlatform" ("id","actorId","action","targetEntity","meta") VALUES (gen_random_uuid()::text,$1,'platform_worker.scope_updated',$2,$3)`, session.adminId, `PlatformAdmin:${input.adminId}`, JSON.stringify({ schoolIds, workerId: input.adminId }));
    return NextResponse.json({ ok: true, access: schoolIds });
  } catch (error) { return routeError(error); }
}
