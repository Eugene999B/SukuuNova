import { randomUUID } from "node:crypto";
import { describe,it,expect } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { createExpenseV2 } from "../src/lib/finance-v2-service";
describe("expense operation identity",()=>{
 it("retries one expense once but permits a separate identical purchase",async()=>{
  const fixture=await createTenantFixture();
  await withTenant(fixture.schoolId,async tx=>{
   const input={schoolId:fixture.schoolId,actorId:fixture.ownerId,operationId:randomUUID(),expenseDate:"2026-09-01",category:"Utilities",vendor:"Demo vendor",amount:45.50,paymentMethod:"cash"};
   const first=await createExpenseV2(tx,input);
   expect(await createExpenseV2(tx,input)).toEqual(first);
   await expect(createExpenseV2(tx,{...input,amount:46})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
   const second=await createExpenseV2(tx,{...input,operationId:randomUUID()});
   expect(second.id).not.toBe(first.id);
   const rows=await tx.$queryRawUnsafe<Array<{count:string}>>(`SELECT COUNT(*)::text AS count FROM "FinanceExpense" WHERE "schoolId"=$1`,fixture.schoolId);
   expect(Number(rows[0].count)).toBe(2);
  });
 });
});
