import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { parseJson } from "@/lib/http";
import { readSchoolDocumentIdentity, updateSchoolDocumentIdentity } from "@/lib/report-card-v2";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const schema = z.object({
  motto: optionalText(180),
  postalAddress: optionalText(240),
  physicalAddress: optionalText(300),
  town: optionalText(100),
  district: optionalText(120),
  region: optionalText(120),
  country: optionalText(100),
  email: optionalText(180),
  phonePrimary: optionalText(60),
  phoneSecondary: optionalText(60),
  website: optionalText(240),
  locationText: optionalText(180),
  departmentName: optionalText(120),
  identifierLabel: optionalText(40),
  documentFooter: optionalText(240),
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      return NextResponse.json(await readSchoolDocumentIdentity(tx, session.schoolId), { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-document-profile:${session.schoolId}`}))`;
      const before = await readSchoolDocumentIdentity(tx, session.schoolId);
      const after = await updateSchoolDocumentIdentity(tx, { schoolId: session.schoolId, actorId: session.userId, ...input });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "settings.school_document_identity_updated",
        entityType: "SchoolDocumentProfile",
        entityId: session.schoolId,
        before,
        after,
      });
      return NextResponse.json(after);
    });
  } catch (error) { return routeError(error); }
}
