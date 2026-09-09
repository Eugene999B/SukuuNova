import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";

export default async function LegacyDeviceSettingsPage() {
  await requireSchoolSession();
  redirect("/school/devices");
}
