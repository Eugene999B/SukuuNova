import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import LibraryReader from "@/components/LibraryReader";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { libraryOverview } from "@/lib/library-service";

type Props = { params: Promise<{ bookId: string }> };

export default async function SchoolLibraryReaderPage({ params }: Props) {
  const session = await requireSchoolSession();
  const { bookId } = await params;
  const result = await withTenant(session.schoolId, async tx => {
    await requireSchoolFeatureInTransaction(tx, session.schoolId, "library");
    const [school, overview] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      libraryOverview(tx, session.schoolId, session.userId),
    ]);
    const book = overview.books.find(item => item.id === bookId);
    if (!school || !book || !book.digitalAvailable || book.visibility === "restricted" && !overview.canManage) return null;
    return {
      school,
      title: typeof book.title === "string" ? book.title : "Library resource",
      author: typeof book.author === "string" ? book.author : null,
      downloadAllowed: Boolean(book.downloadAllowed),
    };
  });
  if (!result) notFound();
  const contentUrl = `/api/school/operations/library/content/${encodeURIComponent(bookId)}`;
  return <AppShell universe="school" title={result.title} subtitle="Protected SukuuNova reading mode." active="Library & Resources" schoolName={result.school.name} schoolCode={result.school.uniqueCode} userName={session.name}><LibraryReader title={result.title} author={result.author} contentUrl={contentUrl} downloadUrl={result.downloadAllowed ? `${contentUrl}?download=1` : null} backHref="/school/library" /></AppShell>;
}
