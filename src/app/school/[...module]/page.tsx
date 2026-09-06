import { notFound, redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";

/*
 * Dedicated school modules own real workflows. This catch-all exists only so an
 * older bookmark/navigation target cannot render a fake operational screen.
 * Known legacy aliases are sent to the nearest real workspace; everything else
 * becomes a genuine 404 instead of pretending the workflow is connected.
 */
const legacyRedirects: Record<string, string> = {
  "admissions/applications": "/school/admissions/enquiries",
  "admissions/enrolment": "/school/admissions/enquiries",
  "attendance/exceptions": "/school/attendance",
  "fees/invoices": "/school/fees",
  "fees/payments": "/school/fees",
  "fees/arrears": "/school/fees",
  "communications/broadcasts": "/school/communications/messages",
  "reports": "/school/reports/analytics",
  "settings/roles": "/school/settings",
};

export default async function SchoolLegacyModulePage({ params }: { params: Promise<{ module?: string[] }> }) {
  await requireSchoolSession();
  const { module = [] } = await params;
  const key = module.join("/");
  const destination = legacyRedirects[key];
  if (!destination) notFound();
  redirect(destination);
}
