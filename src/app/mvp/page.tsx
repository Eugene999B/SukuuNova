import { redirect } from "next/navigation";
import { getSchoolSession } from "@/lib/auth";
import { Phase1Console } from "@/components/Phase1Console";

export default async function MvpPage() {
  if (!(await getSchoolSession())) redirect("/login/school");
  return <Phase1Console />;
}
