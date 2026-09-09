import { redirect } from "next/navigation";

/**
 * Friendly school-calendar entry point.
 * The canonical academic-year, term and holiday/closure management workspace
 * currently lives under /school/terms, so keep links stable while routing
 * administrators to the authoritative calendar configuration surface.
 */
export default function SchoolCalendarPage() {
  redirect("/school/terms");
}
