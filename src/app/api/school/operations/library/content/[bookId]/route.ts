import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { libraryContentAccess } from "@/lib/library-resource-service";
import { streamLibraryResource } from "@/lib/library-reader-source";
import { hasPermission } from "@/lib/rbac";

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { bookId } = await context.params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true" ? "download" : "read";
    const access = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      const canManage = await hasPermission(tx, session.userId, "library:manage");
      if (!canManage) {
        const rows = await tx.$queryRawUnsafe<Array<{ visibility: string; archivedAt: Date | null }>>(`SELECT "visibility","archivedAt" FROM "P3LibraryBook" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, bookId);
        if (!rows[0] || rows[0].archivedAt) throw new AppError("Library resource not found.", 404, "RESOURCE_NOT_FOUND");
        if (rows[0].visibility === "restricted") throw new AppError("This resource is limited to assigned learners or library managers.", 403, "FORBIDDEN");
      }
      return libraryContentAccess(tx, { kind: "school", schoolId: session.schoolId, userId: session.userId }, bookId, mode);
    });
    return streamLibraryResource({ sourceUrl: access.sourceUrl, title: access.title, requestOrigin: url.origin, range: request.headers.get("range"), mode });
  } catch (error) { return routeError(error); }
}
