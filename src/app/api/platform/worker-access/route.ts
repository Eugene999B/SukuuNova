import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError, UnauthorizedError, ForbiddenError, AppError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";

const schema = z.object({ adminId: z.string().min(1), schoolIds: z.array(z.string().min(1)).max(200) });

async function load(adminId: string) {
  const rows = await db.$queryRawUnsafe<Array<{ schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null }>>(
    `SELECT a."schoolId", s."name" AS "schoolName", s."uniqueCode", s."status"
     FROM "PlatformAdminSchoolAccess" a
     LEFT JOIN "School" s ON s."id"=a."schoolId"
     WHERE a."adminId"=$1 ORDER BY s."name" ASC`, adminId);
  return rows;
}

export async function GET() {
  try {
    const session = await getPlatformSession();
    if (!session) throw new UnauthorizedError();
    await requirePlatformPermission(session, "admins.view");
    const [workers, schools] = await Promise.all([
      db.$queryRawUnsafe<Array<{ id: string; name: string; email: string; role: string; status: string }>>(`SELECT "id","name","email","role","status" FROM "PlatformAdmin" ORDER BY "name" ASC`),
      db.$queryRawUnsafe<Array<{ id: string; name: string; uniqueCode: string; status: string }>>(`SELECT "id","name","uniqueCode","status" FROM "School" ORDER BY "name" ASC`),
    ]);
    const access = Object.fromEntries(await Promise.all(workers.map(async w => [w.id, await load(w.id)])));
    return NextResponse.json({ workers, schools, access });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await getPlatformSession();
    if (!session) throw new UnauthorizedError();
    await requirePlatformPermission(session, "admins.manage");
    if (session.role !== "super_admin") throw new ForbiddenError("Only Super Admin can change worker school scope.");
    const input = schema.parse(await request.json());
    const validSchools = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "School" WHERE "id" = ANY($1::text[])`, input.schoolIds);
    if (validSchools.length !== new Set(input.schoolIds).size) throw new AppError("One or more selected schools do not exist.", 400, "INVALID_SCHOOL_SCOPE");
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`DELETE FROM "PlatformAdminSchoolAccess" WHERE "adminId"=$1`, input.adminId);
      for (const schoolId of [...new Set(input.schoolIds)]) {
        await tx.$executeRawUnsafe(`INSERT INTO "PlatformAdminSchoolAccess" ("adminId","schoolId","createdById") VALUES ($1,$2,$3)`, input.adminId, schoolId, session.adminId);
      }
    });
    await db.$executeRawUnsafe(`INSERT INTO "AuditLogPlatform" ("id","actorId","action","targetEntity","meta") VALUES (gen_random_uuid()::text,$1,'platform_worker.scope_updated',$2,$3)`, session.adminId, `PlatformAdmin:${input.adminId}`, JSON.stringify({ schoolIds: [...new Set(input.schoolIds)] }));
    return NextResponse.json({ ok: true, access: await load(input.adminId) });
  } catch (error) { return routeError(error); }
}
