import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { listNovaCoreDecisionEvidence, summarizeNovaCoreDecisionEvidence } from "@/lib/novacore/decision-ledger";
import { evaluateEtaPromotionReadiness } from "@/lib/novacore/eta-promotion-policy";
import { summarizeEtaShadowAccuracy } from "@/lib/novacore/eta-shadow-evaluation";
import { novaCoreRegistrySummary } from "@/lib/novacore/registry";

function positiveLimit(value: string | null) {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw new AppError("limit must be between 1 and 500.", 400, "INVALID_LIMIT");
  return parsed;
}

function summaryDays(value: string | null) {
  if (!value) return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) throw new AppError("days must be between 1 and 90.", 400, "INVALID_DAYS");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await requirePlatformSession();
    if (session.role !== "super_admin") {
      throw new AppError("Only Super Admin can inspect NovaCore algorithm controls.", 403, "FORBIDDEN");
    }
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "registry";
    if (view === "registry") {
      return NextResponse.json(novaCoreRegistrySummary(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const schoolId = url.searchParams.get("schoolId")?.trim();
    if (!schoolId) throw new AppError("schoolId is required for NovaCore evidence.", 400, "NOVACORE_SCHOOL_REQUIRED");

    if (view === "summary") {
      const days = summaryDays(url.searchParams.get("days"));
      const summary = await withTenant(schoolId, async (tx) => {
        const [decisionSummary, etaAccuracy] = await Promise.all([
          summarizeNovaCoreDecisionEvidence(tx, { schoolId, days }),
          summarizeEtaShadowAccuracy(tx, { schoolId, days }),
        ]);
        return {
          ...decisionSummary,
          etaAccuracy,
          etaPromotion: evaluateEtaPromotionReadiness(etaAccuracy),
        };
      });
      return NextResponse.json(summary, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (view !== "decisions") throw new AppError("Unknown NovaCore control view.", 400, "NOVACORE_VIEW_UNKNOWN");
    const evidence = await withTenant(schoolId, (tx) => listNovaCoreDecisionEvidence(tx, {
      schoolId,
      algorithmKey: url.searchParams.get("algorithmKey") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      limit: positiveLimit(url.searchParams.get("limit")),
    }));
    return NextResponse.json({ schoolId, evidence }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
