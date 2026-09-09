import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LibraryReader from "@/components/LibraryReader";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { guardianLibraryOverview } from "@/lib/library-resource-service";

type Props = {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ studentId?: string }>;
};

export default async function GuardianLibraryReaderPage({ params, searchParams }: Props) {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");
  const { bookId } = await params;
  const studentId = (await searchParams).studentId?.trim();
  if (!studentId) notFound();

  const data = await withTenant(session.schoolId, async tx => {
    await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
    const overview = await guardianLibraryOverview(tx, { schoolId: session.schoolId, guardianId: session.guardianId, userId: session.userId }, studentId);
    const book = overview.books.find(item => item.id === bookId);
    if (!book || !book.digitalAvailable) return null;
    const progress = overview.progress.find(item => item.bookId === bookId);
    const bookmarks = overview.bookmarks.filter(item => item.bookId === bookId).map(item => ({
      id: typeof item.id === "string" ? item.id : undefined,
      position: typeof item.position === "string" ? item.position : undefined,
      label: typeof item.label === "string" ? item.label : null,
      note: typeof item.note === "string" ? item.note : null,
    }));
    return {
      title: typeof book.title === "string" ? book.title : "Library resource",
      author: typeof book.author === "string" ? book.author : null,
      downloadAllowed: Boolean(book.downloadAllowed),
      progressPercent: Number(progress?.progressPercent ?? 0),
      bookmarks,
    };
  });
  if (!data) notFound();

  const contentUrl = `/api/guardian/library/content/${encodeURIComponent(bookId)}?studentId=${encodeURIComponent(studentId)}`;
  return <AppShell universe="guardian" title={data.title} subtitle="Protected SukuuNova reading mode." active="Library & Resources" schoolName={session.schoolName} schoolCode="" userName={session.name} role="Guardian"><LibraryReader title={data.title} author={data.author} contentUrl={contentUrl} downloadUrl={data.downloadAllowed ? `${contentUrl}&download=1` : null} backHref={`/guardian/library?studentId=${encodeURIComponent(studentId)}`} bookId={bookId} studentId={studentId} progressPercent={data.progressPercent} bookmarks={data.bookmarks} progressEndpoint="/api/guardian/library" /></AppShell>;
}
