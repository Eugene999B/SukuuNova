import { redirect } from "next/navigation";

type SearchParams = Promise<{ class?: string; classId?: string; subject?: string; subjectId?: string; term?: string; termId?: string }>;

export default async function PerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: "insights" });
  const classId = params.class ?? params.classId;
  const subjectId = params.subject ?? params.subjectId;
  const termId = params.term ?? params.termId;
  if (classId) query.set("class", classId);
  if (subjectId) query.set("subject", subjectId);
  if (termId) query.set("term", termId);
  redirect(`/school/gradebook?${query.toString()}`);
}
