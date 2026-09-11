import { redirect } from "next/navigation";
import PlatformAccountSettingsClient from "./PlatformAccountSettingsClient";
import { getPlatformSession, getSchoolSession } from "@/lib/auth";
import { getGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";

export default async function AccountSettingsPage() {
  // A platform impersonation can intentionally leave both a platform cookie and
  // a school cookie alive. When a school session exists, the user is operating
  // inside that school and must remain in the school/teacher universe.
  const school = await getSchoolSession();
  if (school) {
    const workspace = await withTenant(school.schoolId, async (tx) => (await getSchoolAuthorization(tx, school.userId)).workspace);
    redirect(workspace === "teacher" ? "/teacher/settings" : "/school/settings");
  }

  const guardian = await getGuardianSession();
  if (guardian) redirect("/guardian/settings");

  const platform = await getPlatformSession();
  if (platform) return <PlatformAccountSettingsClient />;

  redirect("/");
}
