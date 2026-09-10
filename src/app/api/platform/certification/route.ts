import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePlatformPermission, requirePlatformSchoolScope } from "@/lib/platform-permissions";
import {
  getPilotCertificationOverview,
  listPilotCertificationEvidenceHistory,
  recordPilotCertificationEvidence,
  type PilotCertificationCheckKey,
} from "@/lib/pilot-certification-service";

const evidenceSchema = z.object({
  action: z.literal("recordEvidence"),
  schoolId: z.string().min(1).max(120),
  checkKey: z.string().min(3).max(120),
  status: z.enum(["in_review", "passed", "failed", "waived"]),
  environment: z.enum(["ci", "staging", "production", "hardware_lab"]),
  evidenceSummary: z.string().trim().min(1).max(2000),
  evidenceRef: z.string().trim().max(1000).nullable().optional(),
  commitSha: z.string().trim().max(80).nullable().optional(),
  ciRun: z.string().trim().max(160).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

function positiveLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) throw new AppError("limit must be between 1 and 200.", 400, "INVALID_LIMIT");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "analytics.view");
    const url = new URL(request.url);
    const schoolId = url.searchParams.get("schoolId")?.trim();
    if (!schoolId) throw new AppError("schoolId is required.", 400, "CERTIFICATION_SCHOOL_REQUIRED");
    await requirePlatformSchoolScope(session, [schoolId]);

    const view = url.searchParams.get("view") ?? "overview";
    if (view === "overview") {
      return NextResponse.json(await getPilotCertificationOverview(schoolId), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (view === "history") {
      const checkKey = url.searchParams.get("checkKey")?.trim();
      if (!checkKey) throw new AppError("checkKey is required for certification history.", 400, "CERTIFICATION_CHECK_REQUIRED");
      const rows = await listPilotCertificationEvidenceHistory(schoolId, checkKey as PilotCertificationCheckKey, positiveLimit(url.searchParams.get("limit")));
      return NextResponse.json({ schoolId, checkKey, rows }, { headers: { "Cache-Control": "private, no-store" } });
    }
    throw new AppError("Unknown certification view.", 400, "CERTIFICATION_VIEW_UNKNOWN");
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "settings.manage");
    const input = await parseJson(request, evidenceSchema);
    await requirePlatformSchoolScope(session, [input.schoolId]);
    const result = await recordPilotCertificationEvidence({
      adminId: session.adminId,
      schoolId: input.schoolId,
      checkKey: input.checkKey as PilotCertificationCheckKey,
      status: input.status,
      environment: input.environment,
      evidenceSummary: input.evidenceSummary,
      evidenceRef: input.evidenceRef,
      commitSha: input.commitSha,
      ciRun: input.ciRun,
      expiresAt: input.expiresAt,
    });
    return NextResponse.json({ ok: true, result }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
