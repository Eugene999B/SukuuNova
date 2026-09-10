import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { CSV_IMPORT_LIMITS } from "@/lib/import/csv";
import { IMPORT_CONTRACTS, importContract, type ColumnMapping, type ImportKind } from "@/lib/import/contracts";
import {
  createCsvImportBatch,
  getSchoolImportBatch,
  listSchoolImportBatches,
  requiredPermissionForImport,
  validateSchoolImportBatch,
} from "@/lib/import/staging-service";

const validateSchema = z.object({
  action: z.literal("validate"),
  batchId: z.string().min(1).max(100),
  columnMapping: z.record(z.string(), z.string().nullable()),
});

const uniquePermissions = [...new Set(Object.keys(IMPORT_CONTRACTS).map((kind) => requiredPermissionForImport(kind as ImportKind)))];

async function accessForKinds(tx: Parameters<Parameters<typeof withTenant>[1]>[0], userId: string) {
  const entries = await Promise.all((Object.keys(IMPORT_CONTRACTS) as ImportKind[]).map(async (kind) => [kind, await hasPermission(tx, userId, requiredPermissionForImport(kind))] as const));
  return Object.fromEntries(entries) as Record<ImportKind, boolean>;
}

async function requireAnyImportPermission(tx: Parameters<Parameters<typeof withTenant>[1]>[0], userId: string) {
  for (const permission of uniquePermissions) {
    if (await hasPermission(tx, userId, permission)) return;
  }
  throw new AppError("You do not have permission to use the school import center.", 403, "FORBIDDEN");
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId")?.trim();
    return NextResponse.json(await withTenant(session.schoolId, async (tx) => {
      await requireAnyImportPermission(tx, session.userId);
      const access = await accessForKinds(tx, session.userId);
      if (batchId) {
        const result = await getSchoolImportBatch(tx, session.schoolId, batchId);
        await requirePermission(tx, session.userId, requiredPermissionForImport(result.batch.kind));
        return { ...result, access };
      }
      const batches = await listSchoolImportBatches(tx, session.schoolId, 50);
      return {
        batches: batches.filter((batch) => access[batch.kind]),
        access,
        contracts: Object.fromEntries((Object.entries(IMPORT_CONTRACTS) as Array<[ImportKind, (typeof IMPORT_CONTRACTS)[ImportKind]]>).filter(([kind]) => access[kind])),
      };
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (String(form.get("action") ?? "upload") !== "upload") throw new AppError("Unknown import action.", 400, "IMPORT_ACTION_INVALID");
      const kindValue = String(form.get("kind") ?? "");
      const contract = importContract(kindValue);
      if (!contract) throw new AppError("Choose a supported import type.", 400, "IMPORT_KIND_INVALID");
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("Choose a CSV file to upload.", 400, "IMPORT_FILE_REQUIRED");
      if (file.size > CSV_IMPORT_LIMITS.maxBytes) throw new AppError("CSV file exceeds the 5 MB import limit.", 413, "IMPORT_FILE_TOO_LARGE");
      const csvText = await file.text();
      const batch = await withTenant(session.schoolId, async (tx) => {
        await requirePermission(tx, session.userId, requiredPermissionForImport(contract.kind));
        return createCsvImportBatch(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          kind: contract.kind,
          sourceFileName: file.name || `${contract.kind}.csv`,
          csvText,
        });
      });
      return NextResponse.json({ batch }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }

    const input = validateSchema.parse(await request.json());
    const result = await withTenant(session.schoolId, async (tx) => {
      const current = await getSchoolImportBatch(tx, session.schoolId, input.batchId);
      await requirePermission(tx, session.userId, requiredPermissionForImport(current.batch.kind));
      return validateSchoolImportBatch(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        batchId: input.batchId,
        columnMapping: input.columnMapping as ColumnMapping,
      });
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
