import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import {
  createFeeStructureV2,
  createScholarshipProgramV2,
  ensureDefaultFinanceCategories,
  publishFeeStructureV2,
} from "../src/lib/finance-v2-service";
import { recordAllocatedPaymentV2Safe } from "../src/lib/finance-v2-payment-service";
import { decideScholarshipV2, requestScholarshipV2 } from "../src/lib/finance-v2-scholarship-service";
import { saveSalaryStructureV2 } from "../src/lib/payroll-v2-service";
import { runPayrollV2ForEffectiveStaff } from "../src/lib/payroll-v2-run-guard";

type CategoryRow={id:string;code:string};
type ChargeRow={id:string;categoryId:string;invoiceId:string;originalAmount:Prisma.Decimal;scholarshipAmount:Prisma.Decimal;netAmount:Prisma.Decimal;status:string};
type PayslipRow={id:string;net:Prisma.Decimal;componentSnapshot:unknown;status:string};

async function academicContext(schoolId:string,ownerId:string,suffix:string){
  return withTenant(schoolId,async tx=>{
    const year=await tx.academicYear.create({data:{schoolId,name:`2026/2027 ${suffix}`,startDate:new Date("2026-09-01T00:00:00.000Z"),endDate:new Date("2027-07-31T00:00:00.000Z")}});
    const term=await tx.term.create({data:{schoolId,academicYearId:year.id,name:`Term 1 ${suffix}`,startDate:new Date("2026-09-01T00:00:00.000Z"),endDate:new Date("2026-12-18T00:00:00.000Z")}});
    const classroom=await tx.class.create({data:{schoolId,name:`Finance V2 Class ${suffix}`}});
    const student=await tx.student.create({data:{schoolId,admissionNo:`FV2-${suffix}-${schoolId}`,name:`Finance V2 Learner ${suffix}`,classId:classroom.id,status:"active"}});
    await tx.$executeRawUnsafe(
      `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
      `fv2-enrol-${student.id}`,schoolId,student.id,year.id,term.id,classroom.id,ownerId,
    );
    return{year,term,classroom,student};
  });
}

describe("Finance V2 accounting integrity",()=>{
  it("publishes class fees once, allocates partial payments idempotently and applies only independently approved scholarship relief",async()=>{
    const fixture=await createTenantFixture();
    const context=await academicContext(fixture.schoolId,fixture.ownerId,"CORE");

    await withTenant(fixture.schoolId,async tx=>{
      await ensureDefaultFinanceCategories(tx,fixture.schoolId);
      const categories=await tx.$queryRawUnsafe<CategoryRow[]>(`SELECT "id","code" FROM "FinanceFeeCategory" WHERE "schoolId"=$1`,fixture.schoolId);
      const tuition=categories.find(row=>row.code==="TUITION");
      const canteen=categories.find(row=>row.code==="CANTEEN");
      expect(tuition).toBeTruthy();expect(canteen).toBeTruthy();

      const structure=await createFeeStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,termId:context.term.id,classId:context.classroom.id,name:"Term One Standard Fees",lines:[{categoryId:tuition!.id,amount:1000,dueDate:"2026-10-01"},{categoryId:canteen!.id,amount:200,dueDate:"2026-10-01"}]});
      const published=await publishFeeStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,structureId:structure.id});
      expect(published).toMatchObject({students:1,charges:2});
      await expect(publishFeeStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,structureId:structure.id})).resolves.toMatchObject({alreadyPublished:true});

      const charges=await tx.$queryRawUnsafe<ChargeRow[]>(`SELECT "id","categoryId","invoiceId","originalAmount","scholarshipAmount","netAmount","status" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "studentId"=$2 ORDER BY "originalAmount" DESC`,fixture.schoolId,context.student.id);
      expect(charges).toHaveLength(2);
      const tuitionCharge=charges.find(row=>row.categoryId===tuition!.id)!;
      const canteenCharge=charges.find(row=>row.categoryId===canteen!.id)!;
      expect(tuitionCharge.originalAmount.toFixed(2)).toBe("1000.00");
      const invoice=await tx.invoice.findFirst({where:{id:tuitionCharge.invoiceId,schoolId:fixture.schoolId}});
      expect(invoice?.totalAmount.toFixed(2)).toBe("1200.00");
      expect(await tx.invoiceLine.count({where:{schoolId:fixture.schoolId,invoiceId:tuitionCharge.invoiceId}})).toBe(2);

      const paymentInput={schoolId:fixture.schoolId,actorId:fixture.ownerId,studentId:context.student.id,invoiceId:tuitionCharge.invoiceId,method:"cash",reference:"FV2-CASH-0001",allocations:[{chargeId:tuitionCharge.id,amount:300}]};
      const first=await recordAllocatedPaymentV2Safe(tx,paymentInput);
      const retry=await recordAllocatedPaymentV2Safe(tx,paymentInput);
      expect(retry.id).toBe(first.id);
      expect(await tx.payment.count({where:{schoolId:fixture.schoolId,reference:"FV2-CASH-0001"}})).toBe(1);
      await expect(recordAllocatedPaymentV2Safe(tx,{...paymentInput,allocations:[{chargeId:tuitionCharge.id,amount:250}]})).rejects.toMatchObject({code:"DUPLICATE_PAYMENT_REFERENCE"});
      await expect(recordAllocatedPaymentV2Safe(tx,{...paymentInput,reference:""})).rejects.toMatchObject({code:"REFERENCE_REQUIRED"});

      const allocation=await tx.$queryRawUnsafe<Array<{amount:Prisma.Decimal}>>(`SELECT "amount" FROM "FinancePaymentAllocation" WHERE "schoolId"=$1 AND "paymentId"=$2`,fixture.schoolId,first.id);
      expect(allocation[0]?.amount.toFixed(2)).toBe("300.00");
      const paidCharge=await tx.$queryRawUnsafe<ChargeRow[]>(`SELECT "id","categoryId","invoiceId","originalAmount","scholarshipAmount","netAmount","status" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "id"=$2`,fixture.schoolId,tuitionCharge.id);
      expect(paidCharge[0]?.status).toBe("partial");

      const program=await createScholarshipProgramV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,name:"Merit Scholarship",sponsor:"School Board"});
      const request=await requestScholarshipV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,programId:program.id,studentId:context.student.id,termId:context.term.id,categoryId:canteen!.id,mode:"percentage",value:50});
      expect(request).toMatchObject({reduction:"100.00",status:"pending"});
      const beforeApproval=await tx.$queryRawUnsafe<ChargeRow[]>(`SELECT "id","categoryId","invoiceId","originalAmount","scholarshipAmount","netAmount","status" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "id"=$2`,fixture.schoolId,canteenCharge.id);
      expect(beforeApproval[0]?.scholarshipAmount.toFixed(2)).toBe("0.00");
      expect(beforeApproval[0]?.netAmount.toFixed(2)).toBe("200.00");
      expect((await tx.invoice.findFirst({where:{id:tuitionCharge.invoiceId,schoolId:fixture.schoolId}}))?.totalAmount.toFixed(2)).toBe("1200.00");
      await expect(decideScholarshipV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,awardId:request.id,decision:"approve"})).rejects.toMatchObject({statusCode:403});

      await tx.userPermissionOverride.createMany({data:[
        {schoolId:fixture.schoolId,userId:fixture.memberId,permissionId:fixture.permissionIds.get("finance:scholarships_approve")!,granted:true},
        {schoolId:fixture.schoolId,userId:fixture.memberId,permissionId:fixture.permissionIds.get("fees:approve")!,granted:true},
      ]});
      const approved=await decideScholarshipV2(tx,{schoolId:fixture.schoolId,actorId:fixture.memberId,awardId:request.id,decision:"approve"});
      expect(approved).toMatchObject({status:"active",reduction:"100.00"});
      const reduced=await tx.$queryRawUnsafe<ChargeRow[]>(`SELECT "id","categoryId","invoiceId","originalAmount","scholarshipAmount","netAmount","status" FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "id"=$2`,fixture.schoolId,canteenCharge.id);
      expect(reduced[0]?.scholarshipAmount.toFixed(2)).toBe("100.00");
      expect(reduced[0]?.netAmount.toFixed(2)).toBe("100.00");
      const projected=await tx.invoice.findFirst({where:{id:tuitionCharge.invoiceId,schoolId:fixture.schoolId}});
      expect(projected?.totalAmount.toFixed(2)).toBe("1100.00");
      expect(await tx.payment.count({where:{schoolId:fixture.schoolId}})).toBe(1);
    });
  });

  it("keeps new finance tables tenant-isolated",async()=>{
    const first=await createTenantFixture();
    const second=await createTenantFixture();
    await withTenant(first.schoolId,tx=>ensureDefaultFinanceCategories(tx,first.schoolId));
    await withTenant(second.schoolId,async tx=>{
      const rows=await tx.$queryRawUnsafe<Array<{schoolId:string}>>(`SELECT "schoolId" FROM "FinanceFeeCategory"`);
      expect(rows.some(row=>row.schoolId===first.schoolId)).toBe(false);
    });
  });
});

describe("Payroll V2 snapshots",()=>{
  it("respects effective dates and freezes historical component values",async()=>{
    const fixture=await createTenantFixture();
    await withTenant(fixture.schoolId,async tx=>{
      const future=await saveSalaryStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,staffId:fixture.ownerId,effectiveFrom:"2026-10-01",components:[
        {name:"Basic Salary",componentType:"earning",calculationType:"fixed",value:4000,taxable:true,pensionable:true},
        {name:"Responsibility Allowance",componentType:"allowance",calculationType:"percentage",value:10,taxable:true},
        {name:"PAYE",componentType:"tax",calculationType:"percentage",value:5},
      ]});
      expect(future.net).toBe("4200.00");
      await expect(runPayrollV2ForEffectiveStaff(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,period:"2026-09",staffIds:[fixture.ownerId]})).rejects.toMatchObject({code:"NO_EFFECTIVE_PAYROLL_STAFF"});

      const october=await runPayrollV2ForEffectiveStaff(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,period:"2026-10",staffIds:[fixture.ownerId]});
      expect(october.staffCount).toBe(1);expect(october.totalNet).toBe("4200.00");
      const firstSlip=await tx.$queryRawUnsafe<PayslipRow[]>(`SELECT "id","net","componentSnapshot","status" FROM "Payslip" WHERE "schoolId"=$1 AND "payrollRunId"=$2 AND "staffId"=$3`,fixture.schoolId,october.id,fixture.ownerId);
      expect(firstSlip[0]?.net.toFixed(2)).toBe("4200.00");
      const octoberSnapshot=JSON.stringify(firstSlip[0]?.componentSnapshot);
      expect(octoberSnapshot).toContain("4000.00");

      const novemberStructure=await saveSalaryStructureV2(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,staffId:fixture.ownerId,effectiveFrom:"2026-11-01",components:[
        {name:"Basic Salary",componentType:"earning",calculationType:"fixed",value:6000,taxable:true,pensionable:true},
        {name:"Responsibility Allowance",componentType:"allowance",calculationType:"percentage",value:10,taxable:true},
        {name:"PAYE",componentType:"tax",calculationType:"percentage",value:5},
      ]});
      expect(novemberStructure.net).toBe("6300.00");
      const historical=await tx.$queryRawUnsafe<PayslipRow[]>(`SELECT "id","net","componentSnapshot","status" FROM "Payslip" WHERE "schoolId"=$1 AND "payrollRunId"=$2 AND "staffId"=$3`,fixture.schoolId,october.id,fixture.ownerId);
      expect(historical[0]?.net.toFixed(2)).toBe("4200.00");
      expect(JSON.stringify(historical[0]?.componentSnapshot)).toBe(octoberSnapshot);

      const november=await runPayrollV2ForEffectiveStaff(tx,{schoolId:fixture.schoolId,actorId:fixture.ownerId,period:"2026-11",staffIds:[fixture.ownerId]});
      expect(november.totalNet).toBe("6300.00");
    });
  });
});
