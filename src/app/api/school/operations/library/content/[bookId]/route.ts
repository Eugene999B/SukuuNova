import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { libraryContentAccess } from "@/lib/library-resource-service";
import { streamLibraryResource } from "@/lib/library-reader-source";

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { bookId } = await context.params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true" ? "download" : "read";
    const access = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
      return libraryContentAccess(tx, { kind: "school", schoolId: session.schoolId, userId: session.userId }, bookId, mode);
    });
    return streamLibraryResource({ sourceUrl: access.sourceUrl, title: access.title, requestOrigin: url.origin, range: request.headers.get("range"), mode });
  } catch (error) { return routeError(error); }
}
