import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError, ForbiddenError, AppError } from "@/lib/errors";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";

const schema = z.object({ adminId: z.string().min(1), schoolIds: z.array(z.string().min(1)).max(200) });

type Worker = { id: string; name: string; email: string; role: string; status: string; permissions: string[] };
type School = { id: string; name: string; uniqueCode: string; status: string };
type AccessRow = { adminId: string; schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null };

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "admins.view");
    if (session.role !== "super_admin") throw new ForbiddenError("Only Super Admin can inspect and manage the platform worker access directory.");
    const [workers, schools, accessRows, permissionRows] = await Promise.all([
      db.$queryRawUnsafe<Array<Omit<Worker, "permissions">>>(`SELECT "id","name","email","role","status" FROM "PlatformAdmin" ORDER BY "name" ASC`),
      db.$queryRawUnsafe<School[]>(`SELECT "id","name","uniqueCode","status" FROM "School" ORDER BY "name" ASC`),
      db.$queryRawUnsafe<AccessRow[]>(`SELECT a."adminId",a."schoolId",s."name" AS "schoolName",s."uniqueCode",s."status" FROM "PlatformAdminSchoolAccess" a LEFT JOIN "School" s ON s."id"=a."schoolId" ORDER BY s."name" ASC`),
      db.$queryRawUnsafe<Array<{ adminId: string; permission: string }>>(`SELECT "adminId","permission" FROM "PlatformAdminPermission" ORDER BY "permission" ASC`),
    ]);
    const permissionMap: Record<string, string[]> = {};
    for (const row of permissionRows) (permissionMap[row.adminId] ??= []).push(row.permission);
    const enrichedWorkers: Worker[] = workers.map(worker => ({ ...worker, permissions: permissionMap[worker.id] ?? [] }));
    const access: Record<string, Array<{ schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null }>> = {};
    for (const worker of enrichedWorkers) access[worker.id] = [];
    for (const row of accessRows) access[row.adminId]?.push({ schoolId: row.schoolId, schoolName: row.schoolName, uniqueCode: row.uniqueCode, status: row.status });
    return NextResponse.json({ workers: enrichedWorkers, schools, access });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "admins.manage");
    if (session.role !== "super_admin") throw new ForbiddenError("Only Super Admin can change worker school scope.");
    const input = schema.parse(await request.json());
    const schoolIds = [...new Set(input.schoolIds)];
    if (input.adminId === session.adminId) throw new ForbiddenError("You cannot change your own school scope.");

    const targetRows = await db.$queryRawUnsafe<Array<{ id: string; name: string; role: string; status: string }>>(
      `SELECT "id","name","role","status" FROM "PlatformAdmin" WHERE "id"=$1 LIMIT 1`,
      input.adminId,
    );
    const target = targetRows[0];
    if (!target) throw new AppError("Worker account was not found.", 404, "WORKER_NOT_FOUND");
    if (target.role === "super_admin") throw new ForbiddenError("Super Admin accounts are not assigned routine school scope.");
    if (target.status !== "active") throw new AppError("Only active worker accounts can receive school scope.", 400, "WORKER_NOT_ACTIVE");

    const validSchools = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "School" WHERE "id" = ANY($1::text[])`, schoolIds);
    if (validSchools.length !== schoolIds.length) throw new AppError("One or more selected schools do not exist.", 400, "INVALID_SCHOOL_SCOPE");

    await db.$transaction(async tx => {
      const beforeRows = await tx.$queryRawUnsafe<Array<{ schoolId: string }>>(
        `SELECT "schoolId" FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1 ORDER BY "schoolId" ASC`,
        input.adminId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1`, input.adminId);
      for (const schoolId of schoolIds) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "PlatformAdminSchoolAccess" ("adminId","schoolId","createdById") VALUES ($1,$2,$3)`,
          input.adminId,
          schoolId,
          session.adminId,
        );
      }
      const beforeSchoolIds = beforeRows.map(row => row.schoolId);
      const changed = JSON.stringify(beforeSchoolIds) !== JSON.stringify(schoolIds);
      if (changed) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "AuditLogPlatform" ("id","actorId","action","targetEntity","meta") VALUES (gen_random_uuid()::text,$1,'platform_worker.scope_updated',$2,$3)`,
          session.adminId,
          `PlatformAdmin:${input.adminId}`,
          JSON.stringify({
            workerId: input.adminId,
            workerName: target.name,
            workerRole: target.role,
            beforeSchoolIds,
            afterSchoolIds: schoolIds,
            addedSchoolCount: schoolIds.filter(id => !beforeSchoolIds.includes(id)).length,
            removedSchoolCount: beforeSchoolIds.filter(id => !schoolIds.includes(id)).length,
          }),
        );
      }
    });

    return NextResponse.json({ ok: true, access: schoolIds });
  } catch (error) { return routeError(error); }
}
