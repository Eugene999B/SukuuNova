import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { applyToPublicPosting, publicPosting, recruitmentAction, recruitmentOverview, requirePublicPostingOpen } from "../src/lib/recruitment-service";
import { mutatePhase3 } from "../src/lib/phase3-service";

async function setup() {
 const f=await createTenantFixture();
 const posting=await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"createPosting",title:"Science teacher",closingDate:"2099-12-31",screeningQuestions:[{id:"licence",label:"Teaching licence?",required:true,type:"select",options:["Yes","No"]}]})) as {id:string;publicToken:string};
 return {...f,posting};
}
function application(){return {name:"Candidate",email:randomUUID()+"@example.test",answers:{licence:"Yes"},submissionKey:randomUUID()};}
async function hire(f:Awaited<ReturnType<typeof setup>>) {
 const input=application();
 const applied=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
 await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"setApplicantStatus",applicantId:applied.applicationId,expectedStatus:"new",status:"hired"}));
 return {...input,id:applied.applicationId};
}
describe("recruitment workflow",()=>{
 it("restores rich metadata and preserves closing dates during partial updates",async()=>{
  const f=await setup();
  await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"updatePosting",postingId:f.posting.id,title:"Updated science teacher"}));
  const posting=await withTenant(f.schoolId,tx=>publicPosting(tx,f.schoolId,f.posting.publicToken));
  expect(posting.title).toBe("Updated science teacher");
  expect((posting.closingDate as Date).toISOString()).toBe("2099-12-31T23:59:59.999Z");
  expect(posting.screeningQuestions).toHaveLength(1);
  await expect(withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"updatePosting",postingId:f.posting.id,status:"invalid"}))).rejects.toThrow();
 });
 it("enforces required answers and validates CV URLs",async()=>{
  const f=await setup(),input=application();
  for(const answers of [{},{licence:"Maybe"}]){
   await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,answers}))).rejects.toThrow();
  }
  await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,resumeUrl:"javascript:alert(1)"}))).rejects.toMatchObject({code:"INVALID_RESOURCE_URL"});
  const overview=await withTenant(f.schoolId,tx=>recruitmentOverview(tx,f.schoolId,f.ownerId));
  expect(overview.applicants).toEqual([]);
 });
 it("records one public application under concurrent network retries",async()=>{
  const f=await setup(),input=application();
  const results=await Promise.all([1,2].map(()=>withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input))));
  expect(results[0].applicationId).toBe(results[1].applicationId);
  const overview=await withTenant(f.schoolId,tx=>recruitmentOverview(tx,f.schoolId,f.ownerId));
  expect(overview.applicants).toHaveLength(1);
  await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,name:"Changed person"}))).rejects.toMatchObject({code:"SUBMISSION_CONFLICT"});
 });
 it("closes intake atomically while retaining a successful retry receipt",async()=>{
  const f=await setup(),input=application();
  const first=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
  await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"setStatus",postingId:f.posting.id,status:"closed"}));
  await expect(withTenant(f.schoolId,async tx=>requirePublicPostingOpen(await publicPosting(tx,f.schoolId,f.posting.publicToken)))).rejects.toMatchObject({code:"POSTING_CLOSED"});
  await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,application()))).rejects.toMatchObject({code:"POSTING_CLOSED"});
  const retry=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
  expect(retry.applicationId).toBe(first.applicationId);
 });
 it("protects candidate stages against stale decisions and cross-tenant access",async()=>{
  const f=await setup(),other=await setup();
  const candidate=await hire(f);
  await expect(withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"setApplicantStatus",applicantId:candidate.id,expectedStatus:"new",status:"rejected"}))).rejects.toMatchObject({code:"APPLICANT_CONFLICT"});
  await expect(withTenant(other.schoolId,tx=>recruitmentAction(tx,other.schoolId,other.ownerId,{action:"setApplicantStatus",applicantId:candidate.id,expectedStatus:"hired",status:"rejected"}))).rejects.toMatchObject({status:404});
  await expect(withTenant(f.schoolId,tx=>recruitmentOverview(tx,f.schoolId,f.memberId))).rejects.toMatchObject({status:403});
 });
 it("creates exactly one staff account under retries and forces a password change",async()=>{
  const f=await setup(),candidate=await hire(f);
  const input={action:"convertApplicant",applicantId:candidate.id,initialPassword:"Temporary-password-2026"};
  const results=await Promise.all([1,2].map(()=>withTenant(f.schoolId,tx=>mutatePhase3(tx,f.schoolId,f.ownerId,"recruitment",input)))) as Array<{staffUserId:string}>;
  expect(results[0].staffUserId).toBe(results[1].staffUserId);
  const users=await withTenant(f.schoolId,tx=>tx.user.findMany({where:{email:candidate.email}}));
  expect(users).toHaveLength(1);expect(users[0].needsPasswordChange).toBe(true);
  const overview=await withTenant(f.schoolId,tx=>recruitmentOverview(tx,f.schoolId,f.ownerId));
  expect(overview.applicants[0]).toMatchObject({status:"converted",staffUserId:users[0].id});
 });
 it("prevents non-Owner recruitment managers from assigning ownership and rolls back the account",async()=>{
  const f=await setup(),candidate=await hire(f);
  const roleName=await withTenant(f.schoolId,async tx=>{
   const assigned=await tx.userRole.findFirstOrThrow({where:{userId:f.ownerId},include:{role:true}});
   await tx.role.update({where:{id:assigned.roleId},data:{key:"owner"}});
   for(const key of ["recruitment:manage","users:write","settings:manage_roles"]){
    const permission=await tx.permission.findUniqueOrThrow({where:{key}});
    await tx.userPermissionOverride.create({data:{schoolId:f.schoolId,userId:f.memberId,permissionId:permission.id,granted:true}});
   }
   return assigned.role.name;
  });
  await expect(withTenant(f.schoolId,tx=>mutatePhase3(tx,f.schoolId,f.memberId,"recruitment",{action:"convertApplicant",applicantId:candidate.id,initialPassword:"Temporary-password-2026",roleName}))).rejects.toMatchObject({status:403});
  expect(await withTenant(f.schoolId,tx=>tx.user.count({where:{email:candidate.email}}))).toBe(0);
 });
 it("issues one stable public link for a legacy vacancy under concurrency",async()=>{
  const f=await setup();
  await withTenant(f.schoolId,tx=>tx.$executeRaw`UPDATE "P3RecruitmentPosting" SET "publicToken"=NULL WHERE "schoolId"=${f.schoolId} AND "id"=${f.posting.id}`);
  const links=await Promise.all([1,2].map(()=>withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"getPublicLink",postingId:f.posting.id})))) as Array<{publicToken:string}>;
  expect(links[0].publicToken).toBe(links[1].publicToken);
 });
});

describe("recruitment receipts after vacancy edits",()=>{
 it("retains the original receipt after screening questions and choices change",async()=>{
  const f=await setup(),input=application();
  const first=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
  await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"updatePosting",postingId:f.posting.id,screeningQuestions:[{id:"new_question",label:"New required question",required:true,type:"shortText"}]}));
  const retry=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
  expect(retry.applicationId).toBe(first.applicationId);
  await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,answers:{licence:"No"}}))).rejects.toMatchObject({code:"SUBMISSION_CONFLICT"});
  await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,submissionKey:randomUUID()}))).rejects.toMatchObject({code:"QUESTIONS_CHANGED"});
 });
 it("compares normalized answers independent of JSONB key order and preserves closed receipts",async()=>{
  const f=await setup();
  await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"updatePosting",postingId:f.posting.id,screeningQuestions:[{id:"zz",label:"Last",type:"shortText"},{id:"a",label:"First",type:"shortText"},{id:"optional",label:"Optional",type:"shortText"}]}));
  const input={...application(),answers:{zz:"  Last answer ",a:"First answer"}};
  const first=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,input));
  await withTenant(f.schoolId,tx=>recruitmentAction(tx,f.schoolId,f.ownerId,{action:"updatePosting",postingId:f.posting.id,status:"closed",screeningQuestions:[]}));
  const retry=await withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,answers:{a:"First answer",zz:"Last answer",optional:""}}));
  expect(retry.applicationId).toBe(first.applicationId);
  for(const patch of [{name:"Other candidate"},{answers:{...input.answers,extra:"Injected"}}]){
   await expect(withTenant(f.schoolId,tx=>applyToPublicPosting(tx,f.schoolId,f.posting.publicToken,{...input,...patch}))).rejects.toMatchObject({code:"SUBMISSION_CONFLICT"});
  }
  expect((await withTenant(f.schoolId,tx=>recruitmentOverview(tx,f.schoolId,f.ownerId))).applicants).toHaveLength(1);
 });
});
