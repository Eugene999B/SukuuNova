import { redirect } from "next/navigation";

export default function ExamsPage() {
  redirect("/school/gradebook?view=assessments");
}
