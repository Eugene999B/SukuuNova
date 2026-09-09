import { afterEach, describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { libraryAction, libraryOverview } from "../src/lib/library-service";
import { guardianLibraryAction, guardianLibraryOverview, libraryContentAccess, schoolLibraryResourceAction } from "../src/lib/library-resource-service";
import { resolveLibraryReaderUrl } from "../src/lib/library-reader-source";

const originalHosts = process.env.LIBRARY_READER_ALLOWED_HOSTS;
const originalPrefixes = process.env.LIBRARY_READER_ALLOWED_PATH_PREFIXES;
afterEach(() => {
  if (originalHosts === undefined) delete process.env.LIBRARY_READER_ALLOWED_HOSTS; else process.env.LIBRARY_READER_ALLOWED_HOSTS = originalHosts;
  if (originalPrefixes === undefined) delete process.env.LIBRARY_READER_ALLOWED_PATH_PREFIXES; else process.env.LIBRARY_READER_ALLOWED_PATH_PREFIXES = originalPrefixes;
});

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async tx => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Resource Hub Class", level: "Primary 5" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, name: "Resource Guardian" } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Ama Reader", admissionNo: `LIB-${fixture.schoolId.slice(0,5)}` } });
    const sibling = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Kojo Reader", admissionNo: `LIB-S-${fixture.schoolId.slice(0,5)}` } });
    const unrelated = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Other Learner", admissionNo: `LIB-O-${fixture.schoolId.slice(0,5)}` } });
    await tx.studentGuardian.createMany({ data: [
      { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent", isPrimary: true },
      { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: sibling.id, relationship: "Parent", isPrimary: false },
    ] });
    const digital = await libraryAction(tx, fixture.schoolId, fixture.ownerId, { action: "createBook", title: "Protected Science Reader", category: "Science", copies: 1, materialType: "pdf", fileUrl: "/library-files/science.pdf" });
    const restricted = await libraryAction(tx, fixture.schoolId, fixture.ownerId, { action: "createBook", title: "Assigned Revision Pack", category: "Mathematics", copies: 1, materialType: "pdf", fileUrl: "/library-files/revision.pdf", visibility: "restricted" });
    const physical = await libraryAction(tx, fixture.schoolId, fixture.ownerId, { action: "createBook", title: "Physical Novel", category: "Literature", copies: 1 });
    return { classroomId: classroom.id, guardianId: guardian.id, studentId: student.id, siblingId: sibling.id, unrelatedId: unrelated.id, digitalId: digital.id, restrictedId: restricted.id, physicalId: physical.id };
  });
  return { ...fixture, ...ids, guardianContext: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}

describe("protected library + student resource hub", () => {
  it("enables and forces tenant RLS on every new learner-library table", async () => {
    const fixture = await createTenantFixture();
    const rows = await withTenant(fixture.schoolId, tx => tx.$queryRawUnsafe<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname`, ["P3LibraryBookmark","P3LibraryCopy","P3LibraryFavourite","P3LibraryReadingProgress","P3LibraryReservation","P3LibraryResourceAssignment"]));
    expect(rows).toHaveLength(6);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it("defaults digital resources to protected read-only access and never leaks source URLs to guardians", async () => {
    const f = await setup();
    const overview = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.studentId));
    const book = overview.books.find(item => item.id === f.digitalId);
    expect(book).toMatchObject({ digitalAvailable: true, downloadAllowed: false, readerEnabled: true });
    expect(book).not.toHaveProperty("fileUrl");
    await expect(withTenant(f.schoolId, tx => libraryContentAccess(tx, { kind: "guardian", ...f.guardianContext, studentId: f.studentId }, f.digitalId, "download"))).rejects.toMatchObject({ code: "DOWNLOAD_DISABLED", status: 403 });
    const readable = await withTenant(f.schoolId, tx => libraryContentAccess(tx, { kind: "guardian", ...f.guardianContext, studentId: f.studentId }, f.digitalId, "read"));
    expect(readable.sourceUrl).toBe("/library-files/science.pdf");
  });

  it("lets the school explicitly enable download without weakening reader or child authorization", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => schoolLibraryResourceAction(tx, f.schoolId, f.ownerId, { action: "updateAccessPolicy", bookId: f.digitalId, readerEnabled: true, downloadAllowed: true, visibility: "school" }));
    const overview = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.studentId));
    expect(overview.books.find(item => item.id === f.digitalId)?.downloadAllowed).toBe(true);
    await expect(withTenant(f.schoolId, tx => libraryContentAccess(tx, { kind: "guardian", ...f.guardianContext, studentId: f.unrelatedId }, f.digitalId, "read"))).rejects.toMatchObject({ status: 403 });
    const download = await withTenant(f.schoolId, tx => libraryContentAccess(tx, { kind: "guardian", ...f.guardianContext, studentId: f.studentId }, f.digitalId, "download"));
    expect(download.downloadAllowed).toBe(true);
  });

  it("keeps restricted resources hidden until assigned to that learner or class", async () => {
    const f = await setup();
    let overview = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.studentId));
    expect(overview.books.some(item => item.id === f.restrictedId)).toBe(false);
    await withTenant(f.schoolId, tx => schoolLibraryResourceAction(tx, f.schoolId, f.ownerId, { action: "assignResource", bookId: f.restrictedId, studentId: f.studentId, kind: "required", note: "Revision for Friday" }));
    overview = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.studentId));
    expect(overview.books.some(item => item.id === f.restrictedId)).toBe(true);
    expect(overview.assignments.find(item => item.bookId === f.restrictedId)).toMatchObject({ kind: "required" });
    const sibling = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.siblingId));
    expect(sibling.books.some(item => item.id === f.restrictedId)).toBe(false);
  });

  it("persists reading progress, completion, bookmarks and favourites only for linked learners", async () => {
    const f = await setup();
    await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "progress", studentId: f.studentId, bookId: f.digitalId, progressPercent: 42, lastPage: 21, totalPages: 50, lastPosition: "page:21" }));
    await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "bookmark", studentId: f.studentId, bookId: f.digitalId, position: "page:21", label: "Important", note: "Review this diagram" }));
    await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "favourite", studentId: f.studentId, bookId: f.digitalId, enabled: true }));
    await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "progress", studentId: f.studentId, bookId: f.digitalId, progressPercent: 100, lastPage: 50, totalPages: 50 }));
    const overview = await withTenant(f.schoolId, tx => guardianLibraryOverview(tx, f.guardianContext, f.studentId));
    expect(Number(overview.progress.find(item => item.bookId === f.digitalId)?.progressPercent)).toBe(100);
    expect(overview.progress.find(item => item.bookId === f.digitalId)?.completedAt).toBeTruthy();
    expect(overview.bookmarks.find(item => item.bookId === f.digitalId)).toMatchObject({ position: "page:21", label: "Important" });
    expect(overview.favourites.some(item => item.bookId === f.digitalId)).toBe(true);
    await expect(withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "progress", studentId: f.unrelatedId, bookId: f.digitalId, progressPercent: 10 }))).rejects.toMatchObject({ status: 403 });
  });

  it("makes reservations idempotent and fulfils them on circulation", async () => {
    const f = await setup();
    const first = await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "reserve", studentId: f.studentId, bookId: f.physicalId }));
    const second = await withTenant(f.schoolId, tx => guardianLibraryAction(tx, f.guardianContext, { action: "reserve", studentId: f.studentId, bookId: f.physicalId }));
    expect(second).toMatchObject({ alreadyReserved: true });
    expect((second.reservation as Record<string, unknown>).id).toBe((first.reservation as Record<string, unknown>).id);
    await withTenant(f.schoolId, tx => libraryAction(tx, f.schoolId, f.ownerId, { action: "borrow", bookId: f.physicalId, studentId: f.studentId, days: 7 }));
    const active = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "P3LibraryReservation" WHERE "schoolId"=$1 AND "id"=$2`, f.schoolId, (first.reservation as Record<string, unknown>).id));
    expect(active[0].status).toBe("fulfilled");
  });

  it("tracks accession copies through issue and return while legacy title counts remain usable", async () => {
    const f = await setup();
    const added = await withTenant(f.schoolId, tx => schoolLibraryResourceAction(tx, f.schoolId, f.ownerId, { action: "addCopy", bookId: f.physicalId, accessionNo: "ACC-001", barcode: "BC-001", shelfLocation: "A-2", condition: "good", status: "available" }));
    const loan = await withTenant(f.schoolId, tx => libraryAction(tx, f.schoolId, f.ownerId, { action: "borrow", bookId: f.physicalId, studentId: f.studentId, days: 14 }));
    expect(loan.copyId).toBe(added.id);
    let copy = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "P3LibraryCopy" WHERE "schoolId"=$1 AND "id"=$2`, f.schoolId, added.id));
    expect(copy[0].status).toBe("on_loan");
    await withTenant(f.schoolId, tx => libraryAction(tx, f.schoolId, f.ownerId, { action: "return", loanId: loan.id }));
    copy = await withTenant(f.schoolId, tx => tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "P3LibraryCopy" WHERE "schoolId"=$1 AND "id"=$2`, f.schoolId, added.id));
    expect(copy[0].status).toBe("available");
    const overview = await withTenant(f.schoolId, tx => libraryOverview(tx, f.schoolId, f.ownerId));
    expect(overview.copies.find(item => item.id === added.id)).toMatchObject({ accessionNo: "ACC-001", barcode: "BC-001" });
  });

  it("allows only configured storage origins and paths for the protected reader", () => {
    process.env.LIBRARY_READER_ALLOWED_PATH_PREFIXES = "/library-files/,/uploads/";
    process.env.LIBRARY_READER_ALLOWED_HOSTS = "cdn.school.test,*.storage.school.test";
    expect(resolveLibraryReaderUrl("/library-files/book.pdf", "https://app.school.test").href).toBe("https://app.school.test/library-files/book.pdf");
    expect(resolveLibraryReaderUrl("https://cdn.school.test/book.pdf", "https://app.school.test").hostname).toBe("cdn.school.test");
    expect(resolveLibraryReaderUrl("https://class.storage.school.test/book.pdf", "https://app.school.test").hostname).toBe("class.storage.school.test");
    for (const value of ["/api/private", "https://evil.example/book.pdf", "http://cdn.school.test/book.pdf", "https://user:pass@cdn.school.test/book.pdf"]) {
      expect(() => resolveLibraryReaderUrl(value, "https://app.school.test")).toThrow();
    }
  });
});
