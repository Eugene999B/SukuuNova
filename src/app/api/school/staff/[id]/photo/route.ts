import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { assertPortraitVerificationToken } from "@/lib/portrait-verification";

const schema = z.object({
  photoData: z.string().max(1_000_000).nullable(),
  verificationToken: z.string().max(4_000).nullable().optional(),
});

function validatePhoto(value: string | null) {
  if (value == null || value === "") return null;
  if (!/^data:image\/(?:jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    throw new AppError("Staff portrait must be a JPEG or PNG image captured and verified by SukuuNova.", 400, "STAFF_PHOTO_INVALID");
  }
  return value;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id: staffId } = await context.params;
    const input = await parseJson(request, schema);
    const photoData = validatePhoto(input.photoData);
    if (photoData) {
      assertPortraitVerificationToken({
        token: input.verificationToken ?? "",
        schoolId: session.schoolId,
        target: "staff",
        image: photoData,
      });
    }
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "users:write");
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; name: string; photoUrl: string | null }>>(
        `SELECT u."id",u."name",u."photoUrl" FROM "User" u
         WHERE u."schoolId"=$1 AND u."id"=$2
           AND EXISTS (
             SELECT 1 FROM "UserRole" ur JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId"
             WHERE ur."schoolId"=$1 AND ur."userId"=u."id" AND r."name" NOT IN ('Parent','Student')
           ) LIMIT 1`,
        session.schoolId,
        staffId,
      );
      const staff = rows[0];
      if (!staff) throw new AppError("Staff member not found.", 404, "STAFF_NOT_FOUND");
      await tx.$executeRawUnsafe(
        `UPDATE "User" SET "photoUrl"=$3 WHERE "schoolId"=$1 AND "id"=$2`,
        session.schoolId,
        staffId,
        photoData,
      );
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "staff.portrait_updated",
        entityType: "User",
        entityId: staffId,
        before: { hasPortrait: Boolean(staff.photoUrl) },
        after: { hasPortrait: Boolean(photoData), serverVerified: Boolean(photoData) },
      });
    });
    return NextResponse.json({ ok: true, photoUrl: photoData }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
