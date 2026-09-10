import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { getSchoolImportBatch, requiredPermissionForImport } from "@/lib/import/staging-service";

function spreadsheetSafe(value: string) {
  const trimmed = value.trimStart();
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value;
}

function csvCell(value: unknown) {
  const text = spreadsheetSafe(value == null ? "" : typeof value === "string" ? value : JSON.stringify(value));
  return `"${text.replace(/"/g, '""')}"`;
}

function issueMessages(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return String(item ?? "");
    const row = item as Record<string, unknown>;
    const field = typeof row.field === "string" && row.field ? `${row.field}: ` : "";
    return `${field}${typeof row.message === "string" ? row.message : typeof row.code === "string" ? row.code : "Validation issue"}`;
  }).filter(Boolean).join(" | ");
}

function safeFileStem(value: string) {
  return value.replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "school-import";
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId")?.trim();
    if (!batchId) throw new AppError("batchId is required.", 400, "IMPORT_BATCH_REQUIRED");

    const result = await withTenant(session.schoolId, async (tx) => {
      const data = await getSchoolImportBatch(tx, session.schoolId, batchId);
      await requirePermission(tx, session.userId, requiredPermissionForImport(data.batch.kind));
      return data;
    });

    const lines = [
      ["Source row", "Status", "Validation issues", "Mapped data", "Original data"].map(csvCell).join(","),
      ...result.rows.map((row) => [
        row.rowNumber,
        row.status,
        issueMessages(row.validationErrors),
        row.normalizedData ?? {},
        row.rawData ?? {},
      ].map(csvCell).join(",")),
    ];
    const fileName = `${safeFileStem(result.batch.sourceFileName)}-validation-report.csv`;
    return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
