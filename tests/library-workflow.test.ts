import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { libraryAction, libraryOverview } from "../src/lib/library-service";
import { listPhase3, mutatePhase3 } from "../src/lib/phase3-service";
import { safeResourceUrl } from "../src/lib/resource-url";

async function setup() {
  const fixture = await createTenantFixture();
  const data = await withTenant(fixture.schoolId, async tx => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Library class" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, name: "Library guardian" } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Linked learner", admissionNo: "library-one" } });
    const other = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Other learner", admissionNo: "library-two" } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
    const permission = await tx.permission.findUniqueOrThrow({ where: { key: "library:borrow" } });
    await tx.userPermissionOverride.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId: permission.id, granted: true } });
    const book = await libraryAction(tx, fixture.schoolId, fixture.ownerId, { action: "createBook", title: "Library testing", category: "Science", copies: 1 });
    return { studentId: student.id, otherId: other.id, bookId: book.id, classId: classroom.id };
  });
  return { ...fixture, ...data };
}
describe("connected library circulation", () => {
  it("makes duplicate issue and return retries idempotent and preserves availability", async () => {
    const f = await setup();
    const action = { action: "borrow", bookId: f.bookId, studentId: f.studentId, days: 7 };
    const loans = await Promise.all([1,2].map(()=>withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,action))));
    expect(loans[0].id).toBe(loans[1].id);
    const borrowed = await withTenant(f.schoolId,tx=>libraryOverview(tx,f.schoolId,f.ownerId));
    expect(borrowed.books[0].availableCopies).toBe(0);
    expect(borrowed.loans).toHaveLength(1);
    const due = new Date(String(borrowed.loans[0].dueAt)).getTime();
    expect(due-Date.now()).toBeGreaterThan(6.9*86400000);
    expect(due-Date.now()).toBeLessThanOrEqual(7*86400000);
    await Promise.all([1,2].map(()=>withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"return",loanId:loans[0].id}))));
    const returned = await withTenant(f.schoolId,tx=>libraryOverview(tx,f.schoolId,f.ownerId));
    expect(returned.books[0].availableCopies).toBe(1);
    expect(returned.loans[0].status).toBe("returned");
    const audits = await withTenant(f.schoolId,tx=>tx.auditLogSchool.findMany({where:{entityId:loans[0].id}}));
    expect(audits.map(a=>a.action).sort()).toEqual(["library.book_borrowed","library.book_returned"]);
  });
  it("prevents overselling the final copy to different learners", async () => {
    const f = await setup();
    const results = await Promise.allSettled([f.studentId,f.otherId].map(studentId=>withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"borrow",bookId:f.bookId,studentId}))));
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
  });
  it("applies identical linked-child scope to both API service paths", async () => {
    const f = await setup();
    const otherLoan = await withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"borrow",bookId:f.bookId,studentId:f.otherId}));
    const direct = await withTenant(f.schoolId,tx=>libraryOverview(tx,f.schoolId,f.memberId));
    const legacy = await withTenant(f.schoolId,tx=>listPhase3(tx,f.memberId,"library")) as typeof direct;
    expect(direct.loans).toEqual([]);expect(legacy.loans).toEqual([]);
    expect(direct.students.map(student=>student.id)).toEqual([f.studentId]);
    await expect(withTenant(f.schoolId,tx=>mutatePhase3(tx,f.schoolId,f.memberId,"library",{action:"return",loanId:otherLoan.id}))).rejects.toMatchObject({status:403});
    await expect(withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.memberId,{action:"borrow",bookId:f.bookId,studentId:f.otherId}))).rejects.toMatchObject({status:403});
  });
  it("lets assigned class teachers circulate without opening school-wide loans", async () => {
    const f = await setup();
    await withTenant(f.schoolId,tx=>tx.class.update({where:{id:f.classId},data:{classTeacherId:f.memberId}}));
    const overview = await withTenant(f.schoolId,tx=>libraryOverview(tx,f.schoolId,f.memberId));
    expect(overview.students).toHaveLength(2);
    await withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.memberId,{action:"borrow",bookId:f.bookId,studentId:f.otherId}));
  });
  it("keeps the legacy explicit deadline and rejects invalid catalogue links", async () => {
    const f = await setup(), dueAt = new Date(Date.now()+3*86400000).toISOString();
    const loan = await withTenant(f.schoolId,tx=>mutatePhase3(tx,f.schoolId,f.ownerId,"library",{action:"borrow",bookId:f.bookId,studentId:f.studentId,dueAt})) as {id:string};
    const overview = await withTenant(f.schoolId,tx=>libraryOverview(tx,f.schoolId,f.ownerId));
    expect(overview.loans[0].id).toBe(loan.id);
    expect(new Date(String(overview.loans[0].dueAt)).toISOString()).toBe(dueAt);
    await expect(withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"updateBook",bookId:f.bookId,fileUrl:"javascript:alert(1)"}))).rejects.toMatchObject({code:"INVALID_RESOURCE_URL"});
    await expect(withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"updateBook",bookId:"missing",title:"Missing"}))).rejects.toMatchObject({status:404});
  });
  it("blocks cross-school and inactive learner circulation", async () => {
    const f = await setup(), other = await setup();
    await expect(withTenant(other.schoolId,tx=>libraryAction(tx,other.schoolId,other.ownerId,{action:"borrow",bookId:f.bookId,studentId:other.studentId}))).rejects.toMatchObject({code:"BOOK_UNAVAILABLE"});
    await withTenant(f.schoolId,tx=>tx.student.update({where:{id:f.studentId},data:{status:"inactive"}}));
    await expect(withTenant(f.schoolId,tx=>libraryAction(tx,f.schoolId,f.ownerId,{action:"borrow",bookId:f.bookId,studentId:f.studentId}))).rejects.toMatchObject({code:"STUDENT_NOT_FOUND"});
  });
  it("filters unsafe legacy URLs while retaining usable web and same-site resources", () => {
    expect(safeResourceUrl("https://example.com/book.pdf")).toBe("https://example.com/book.pdf");
    expect(safeResourceUrl("/files/book.pdf")).toBe("/files/book.pdf");
    for(const url of ["javascript:alert(1)","data:text/html,test","//example.com","https://user:pass@example.com","/\\evil.example"])expect(safeResourceUrl(url)).toBeNull();
  });
});
