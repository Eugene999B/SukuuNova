import { redirect } from "next/navigation";

export default function LegacyRolesPage() {
  redirect("/school/settings/roles");
}
