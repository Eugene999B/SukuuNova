import { redirect } from "next/navigation";

export default function EnrolmentPage() {
  redirect("/school/admissions/applications?status=accepted");
}
