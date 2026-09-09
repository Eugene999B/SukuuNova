import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { libraryOverview, libraryAction } from "@/lib/library-service";
import { schoolLibraryResourceAction } from "@/lib/library-resource-service";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";

const RESOURCE_ACTIONS = new Set(["updateAccessPolicy", "addCopy", "assignResource"]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      const overview = await libraryOverview(tx, session.schoolId, session.userId);
      if (!overview.canManage) return { ...overview, classes: [], subjects: [] };
      const [classes, subjects] = await Promise.all([
        tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } }),
        tx.subject.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
      ]);
      return { ...overview, classes, subjects };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const body = await parseJson(request, z.record(z.string().min(1).max(100), z.unknown()));
    const result = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      const action = typeof body.action === "string" ? body.action : "";
      return RESOURCE_ACTIONS.has(action)
        ? schoolLibraryResourceAction(tx, session.schoolId, session.userId, body)
        : libraryAction(tx, session.schoolId, session.userId, body);
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
