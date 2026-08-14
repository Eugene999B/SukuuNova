import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "students:read");
    });
    return NextResponse.json({
      ok: true,
      permission: "students:read",
      records: [],
      note: "Permission proof only; the student module is not part of Phase 0."
    });
  } catch (error) {
    return routeError(error);
  }
}
