import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/auth";

export default async function InventoryPage() {
  await requireSchoolSession();
  redirect("/school/properties");
}
