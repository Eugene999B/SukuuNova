import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantDb } from "../src/lib/db";
const mocks=vi.hoisted(()=>({authorization:vi.fn(),permission:vi.fn(async()=>undefined)}));
vi.mock("../src/lib/authorization",()=>({getSchoolAuthorization:mocks.authorization}));
vi.mock("../src/lib/rbac",()=>({requirePermission:mocks.permission,hasPermission:vi.fn(async()=>true)}));
vi.mock("../src/lib/student-term-context",()=>({
 reportSnapshotClassId:(snapshot:{classId?:string})=>snapshot.classId??null,
 resolveStudentTermClass:vi.fn(async()=>({classId:"assigned"})),
}));
vi.mock("../src/lib/report-card-print-data",()=>({getReportCardPrintData:vi.fn(async()=>({reportId:"r"}))}));
vi.mock("../src/lib/report-card-signatures",()=>({signaturesForReport:vi.fn(async()=>[])}));
import { reportClassAccess, requireReportAccess } from "../src/lib/report-card-access";
import { getVisibleReportDocument } from "../src/lib/report-card-service";
const tx={
 class:{findMany:vi.fn(async()=>[{id:"assigned"}])},
 reportCard:{
  findFirst:vi.fn(async()=>({id:"r",studentId:"s",termId:"t",calculationSnapshot:{classId:"other"}})),
  findUnique:vi.fn(async()=>({id:"r",schoolId:"school",status:"draft",student:{guardians:[]}})),
 },
} as unknown as TenantDb;
beforeEach(()=>mocks.authorization.mockResolvedValue({user:{schoolId:"school"},isElevated:false,isTeacher:true,can:vi.fn(async()=>false)}));
describe("report access boundaries",()=>{
 it("awaits a denied school-wide permission and limits teachers to assigned classes",async()=>{
  expect((await reportClassAccess(tx,"teacher")).classIds).toEqual(["assigned"]);
  await expect(requireReportAccess(tx,"teacher","r")).rejects.toMatchObject({status:403});
 });
 it("allows explicit school-wide academic access",async()=>{
  mocks.authorization.mockResolvedValue({user:{schoolId:"school"},isElevated:false,isTeacher:true,can:vi.fn(async()=>true)});
  expect((await reportClassAccess(tx,"coordinator")).classIds).toBeNull();
 });
 it("does not misclassify an administrator with guardian permissions as a parent",async()=>{
  mocks.authorization.mockResolvedValue({user:{schoolId:"school"},isElevated:true,isTeacher:false,can:vi.fn(async()=>true)});
  expect((await getVisibleReportDocument(tx,{actorId:"owner",reportCardId:"r"})).data.reportId).toBe("r");
 });
 it("denies unrelated draft reports to a parent",async()=>{
  mocks.authorization.mockResolvedValue({user:{schoolId:"school"},isElevated:false,isTeacher:false,can:vi.fn(async()=>false)});
  await expect(getVisibleReportDocument(tx,{actorId:"parent",reportCardId:"r"})).rejects.toMatchObject({status:403});
 });
});
