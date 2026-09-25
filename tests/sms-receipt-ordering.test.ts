import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rawDb } from "./helpers";
import { applyArkeselSmsDeliveryReceipt } from "../src/lib/sms-delivery-receipts";

describe("persisted provider delivery receipt ordering",()=>{
  it("survives duplicate and out-of-order callbacks without losing delivery confirmation",async()=>{
    const id=randomUUID(), smsId=randomUUID();
    await rawDb.$executeRawUnsafe('INSERT INTO "PlatformSmsDelivery" ("id","batchId","recipientPhone","messageBody","providerKey","providerMessageId","status") VALUES ($1,$1,$2,$3,\'arkesel\',$4,\'SUBMITTED\')',id,"+233000000000","Isolated test; no external send",smsId);
    try {
      const state=async()=> (await rawDb.$queryRawUnsafe<Array<{status:string;deliveredAt:Date|null}>>('SELECT "status","deliveredAt" FROM "PlatformSmsDelivery" WHERE "id"=$1',id))[0];
      expect(await applyArkeselSmsDeliveryReceipt({smsId,status:"NOT_DELIVERED"})).toMatchObject({matched:true,scope:"platform"});
      await applyArkeselSmsDeliveryReceipt({smsId,status:"QUEUED"});
      expect((await state()).status).toBe("NOT_DELIVERED");
      await applyArkeselSmsDeliveryReceipt({smsId,status:"DELIVERED"});
      const delivered=await state();
      expect(delivered.status).toBe("DELIVERED");
      expect(delivered.deliveredAt).not.toBeNull();
      for(const status of ["SUBMITTED","EXPIRED","NOT_DELIVERED","DELIVERED"]) await applyArkeselSmsDeliveryReceipt({smsId,status});
      expect(await state()).toEqual(delivered);
      expect(await applyArkeselSmsDeliveryReceipt({smsId,status:"invented"})).toMatchObject({matched:false,invalid:true});
      expect(await state()).toEqual(delivered);
    } finally { await rawDb.$executeRawUnsafe('DELETE FROM "PlatformSmsDelivery" WHERE "id"=$1',id); }
  });
});
