import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { getGuardianSlotInfo } from "@/lib/guardian-service";

const schema = z.object({ studentIds: z.array(z.string().min(1).max(100)).min(1).max(100) });

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, async (tx) => {
      if (!(await hasPermission(tx, session.userId, "students:read"))) {
        throw new ForbiddenError("You do not have permission to view guardian eligibility.");
      }
      const slots = [];
      for (const studentId of [...new Set(input.studentIds)]) {
        try {
          slots.push(await getGuardianSlotInfo(tx, session.schoolId, studentId));
        } catch {
          slots.push({ studentId, totalLinks: 0, activePortalLinks: 0, slotsRemaining: 0, eligible: false });
        }
      }
      return slots;
    });
    return NextResponse.json({ ok: true, slots: result });
  } catch (error) {
    return routeError(error);
  }
}
