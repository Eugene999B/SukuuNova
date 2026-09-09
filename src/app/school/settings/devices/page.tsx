import { redirect } from "next/navigation";

export default function LegacyDeviceSettingsPage() {
  redirect("/school/devices");
}
