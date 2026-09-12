import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createFeeStructureV2, ensureDefaultFinanceCategories } from "../src/lib/finance-v2-service";
import { publishFeeStructureV2Safe } from "../src/lib/finance-v2-publish-service";
import { recordAllocatedPaymentV2Safe } from "../src/lib/finance-v2-payment-service";

describe("Finance V2 release hardening",()=>{
  it("keeps published billing immutable and accepts supported bank payments",async()=>{
    const fixture=await createTenantFixture();
    await withTenant(fixture.schoolId,async tx=>{
      const year=await tx.academicYear.create({data:{schoolId:fixture.schoolId,name:`2026/2027 HARD-${fixture.schoolId}`,startDate:new Date("2026-09-01T00:00:00.000Z"),endDate:new Date("2027-07-31T00:00:00.000Z")}});
      const term=await tx.term.create({data:{schoolId:fixture.schoolId,academicYearId:year.id,name:"Hardening Term",startDate:new Date("2026-09-01T00:00:00.000Z"),endDate:new Date("2026-12-18T00:00:00.000Z")}});
      const classroom=await tx.class.create({data:{schoolId:fixture.schoolId,name:`Hardening Class ${fixture.schoolId}`}});
      const student=await tx.student.create({data:{schoolId:fixture.schoolId,admissionNo:`HARD-${fixture.schoolId}`,name:"Hardening Learner",classId:classroom.id,status:"active"}});

      await ensureDefaultFinanceCategories(tx,fixture.schoolId);
      const categories=await tx.$queryRawUnsafe<Array<{id:string;code:string}>>(`SELECT "id","code" FROM "FinanceFeeCategory" WHERE "schoolId"=$1`,fixture.schoolId);
      const tuition=categories.find(row=>row.code==="TUITION");
      expect(tuition).toBeTruthy();

      const first=await createFeeStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,termId:term.id,classId:classroom.id,name:"Official Fees",lines:[{categoryId:tuition!.id,amount:1000}]});
      await publishFeeStructureV2Safe(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,structureId:first.id});
      const chargeRows=await tx.$queryRawUnsafe<Array<{id:string;invoiceId:string}>>(`SELECT "id","invoiceId" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "studentId"=$2`,fixture.schoolId,student.id);
      expect(chargeRows).toHaveLength(1);
      const beforeLines=await tx.invoiceLine.findMany({where:{schoolId:fixture.schoolId,invoiceId:chargeRows[0]!.invoiceId},select:{amount:true}});
      expect(beforeLines.map(row=>row.amount.toFixed(2))).toEqual(["1000.00"]);

      const second=await createFeeStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,termId:term.id,classId:classroom.id,name:"Official Fees Revised",lines:[{categoryId:tuition!.id,amount:1200}]});
      await expect(publishFeeStructureV2Safe(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,structureId:second.id})).rejects.toMatchObject({code:"PUBLISHED_STRUCTURE_EXISTS"});
      const afterLines=await tx.invoiceLine.findMany({where:{schoolId:fixture.schoolId,invoiceId:chargeRows[0]!.invoiceId},select:{amount:true}});
      expect(afterLines.map(row=>row.amount.toFixed(2))).toEqual(["1000.00"]);

      const payment=await recordAllocatedPaymentV2Safe(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,studentId:student.id,invoiceId:chargeRows[0]!.invoiceId,method:"bank",reference:"HARD-BANK-001",allocations:[{chargeId:chargeRows[0]!.id,amount:100}]});
      expect(payment.amount.toFixed(2)).toBe("100.00");
      expect((await tx.payment.findFirst({where:{id:payment.id,schoolId:fixture.schoolId},select:{method:true}}))?.method).toBe("bank");
    });
  });
});
