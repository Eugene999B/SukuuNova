import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformSession } from "../src/lib/auth";
import { db, withTenant } from "../src/lib/db";
import { enqueueNotification } from "../src/lib/message-outbox";
import { adjustMessagingBalance, getMessagingWallet } from "../src/lib/platform-control-plane-safe-service";
import { adjustMessagingInventory, getMessagingInventory, recordMessagingPurchase } from "../src/lib/platform-messaging-inventory-service";
import { sendSmsThroughProvider } from "../src/lib/sms-provider";
import { estimateSmsSegments } from "../src/lib/sms-segments";
import { createTenantFixture } from "./helpers";

const ENV_KEYS=["ARKESEL_API_KEY","ARKESEL_SMS_URL","SAILUP_API_KEY","SAILUP_SMS_URL","HUBTEL_CLIENT_ID","HUBTEL_CLIENT_SECRET","HUBTEL_SMS_URL","SMS_PROVIDER_URL","SMS_PROVIDER_TOKEN","SMS_SENDER_ID"] as const;
const originalEnv=Object.fromEntries(ENV_KEYS.map(key=>[key,process.env[key]])) as Record<(typeof ENV_KEYS)[number],string|undefined>;

afterEach(()=>{
  vi.unstubAllGlobals();
  for(const key of ENV_KEYS){const value=originalEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

const platformSession:PlatformSession={kind:"platform",adminId:"sms-test-super-admin",name:"SMS Test Super Admin",role:"super_admin",authorizationVersion:"test"};

async function setSmsWallet(schoolId:string,balance:number){
  await withTenant(schoolId,tx=>tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingWallet" ("schoolId","smsBalance","whatsappBalance","status","updatedAt") VALUES ($1,$2,0,'active',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId") DO UPDATE SET "smsBalance"=EXCLUDED."smsBalance","updatedAt"=CURRENT_TIMESTAMP`,schoolId,balance));
}

async function smsBalance(schoolId:string){
  return withTenant(schoolId,async tx=>{
    const rows=await tx.$queryRawUnsafe<Array<{smsBalance:number}>>(`SELECT "smsBalance" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`,schoolId);
    return rows[0]?.smsBalance??0;
  });
}

describe("SMS segment accounting",()=>{
  it("matches GSM-7, extension and Unicode segment boundaries",async()=>{
    expect(estimateSmsSegments("A".repeat(160))).toMatchObject({encoding:"GSM-7",segments:1});
    expect(estimateSmsSegments("A".repeat(161))).toMatchObject({encoding:"GSM-7",segments:2});
    expect(estimateSmsSegments("^".repeat(80))).toMatchObject({encoding:"GSM-7",units:160,segments:1});
    expect(estimateSmsSegments("^".repeat(81))).toMatchObject({encoding:"GSM-7",units:162,segments:2});
    expect(estimateSmsSegments("界".repeat(70))).toMatchObject({encoding:"UCS-2",segments:1});
    expect(estimateSmsSegments("界".repeat(71))).toMatchObject({encoding:"UCS-2",segments:2});
    expect(estimateSmsSegments("😀".repeat(35))).toMatchObject({encoding:"UCS-2",units:70,segments:1});
    expect(estimateSmsSegments("😀".repeat(36))).toMatchObject({encoding:"UCS-2",units:72,segments:2});

    const sql=await db.$queryRawUnsafe<Array<{gsm160:number;gsm161:number;unicode70:number;unicode71:number;emoji35:number;emoji36:number}>>(`SELECT sukuunova_sms_segment_count($1)::int AS "gsm160",sukuunova_sms_segment_count($2)::int AS "gsm161",sukuunova_sms_segment_count($3)::int AS "unicode70",sukuunova_sms_segment_count($4)::int AS "unicode71",sukuunova_sms_segment_count($5)::int AS "emoji35",sukuunova_sms_segment_count($6)::int AS "emoji36"`,"A".repeat(160),"A".repeat(161),"界".repeat(70),"界".repeat(71),"😀".repeat(35),"😀".repeat(36));
    expect(sql[0]).toEqual({gsm160:1,gsm161:2,unicode70:1,unicode71:2,emoji35:1,emoji36:2});
  });

  it("debits the school wallet by actual SMS segments and records the same ledger quantity",async()=>{
    const fixture=await createTenantFixture();
    await setSmsWallet(fixture.schoolId,10);
    const [message]=await withTenant(fixture.schoolId,tx=>enqueueNotification(tx,{schoolId:fixture.schoolId,recipientType:"user",recipientId:fixture.ownerId,recipientPhone:"233240000001",body:"A".repeat(161),channels:"sms"}));
    expect(message).toBeTruthy();
    expect(await smsBalance(fixture.schoolId)).toBe(8);
    const ledger=await withTenant(fixture.schoolId,tx=>tx.$queryRawUnsafe<Array<{quantity:number;balanceAfter:number;reference:string|null}>>(`SELECT "quantity","balanceAfter","reference" FROM "PlatformMessagingLedger" WHERE "schoolId"=$1 AND "reference"=$2 ORDER BY "createdAt" DESC LIMIT 1`,fixture.schoolId,`message:${message!.id}`));
    expect(ledger[0]).toMatchObject({quantity:-2,balanceAfter:8,reference:`message:${message!.id}`});
  });

  it("rolls back an SMS queue insert when the school lacks enough segments",async()=>{
    const fixture=await createTenantFixture();
    await setSmsWallet(fixture.schoolId,1);
    await expect(withTenant(fixture.schoolId,tx=>enqueueNotification(tx,{schoolId:fixture.schoolId,recipientType:"user",recipientId:fixture.ownerId,recipientPhone:"233240000002",body:"A".repeat(161),channels:"sms"}))).rejects.toBeTruthy();
    expect(await smsBalance(fixture.schoolId)).toBe(1);
    const messages=await withTenant(fixture.schoolId,tx=>tx.message.count({where:{schoolId:fixture.schoolId,channel:"sms"}}));
    expect(messages).toBe(0);
  });
});

describe("SMS provider adapters",()=>{
  it("uses the official Arkesel-style v2 payload and reports provider credits",async()=>{
    process.env.ARKESEL_API_KEY="arkesel-secret-test";
    process.env.SMS_SENDER_ID="SukuuNova";
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"success",data:{id:"ark-123",credits_used:2}}),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await sendSmsThroughProvider("arkesel",{phone:"233240000003",body:"Hello"});
    expect(result).toEqual({providerKey:"arkesel",providerMessageId:"ark-123",creditsUsed:2});
    const [url,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(url).toBe("https://sms.arkesel.com/api/v2/sms/send");
    expect((init.headers as Record<string,string>)["api-key"]).toBe("arkesel-secret-test");
    expect(JSON.parse(String(init.body))).toEqual({sender:"SukuuNova",message:"Hello",recipients:["233240000003"]});
  });

  it("supports Sailup as a bearer-token low-cost alternative",async()=>{
    process.env.SAILUP_API_KEY="sailup-secret-test";
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"sail-123",quantity:1}),{status:202,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await sendSmsThroughProvider("sailup",{phone:"233240000004",body:"Hello",senderId:"School"});
    expect(result).toEqual({providerKey:"sailup",providerMessageId:"sail-123",creditsUsed:1});
    const [url,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(url).toBe("https://api.sailup.io/v1/sms/");
    expect((init.headers as Record<string,string>).authorization).toBe("Bearer sailup-secret-test");
    expect(JSON.parse(String(init.body))).toEqual({from:"School",to:["233240000004"],body:"Hello"});
  });

  it("supports Hubtel without misclassifying monetary rate as SMS credit quantity",async()=>{
    process.env.HUBTEL_CLIENT_ID="hubtel-client";
    process.env.HUBTEL_CLIENT_SECRET="hubtel-secret";
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{messageId:"hub-123",rate:0.0201}}),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await sendSmsThroughProvider("hubtel",{phone:"233240000005",body:"Hello",senderId:"School"});
    expect(result).toEqual({providerKey:"hubtel",providerMessageId:"hub-123"});
    const [url,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(url).toBe("https://smsc.hubtel.com/v1/messages/send");
    expect((init.headers as Record<string,string>).authorization).toBe(`Basic ${Buffer.from("hubtel-client:hubtel-secret").toString("base64")}`);
    expect(JSON.parse(String(init.body))).toEqual({from:"School",to:"233240000005",content:"Hello"});
  });
});

describe("platform-owned SMS inventory and school resale wallet",()=>{
  it("moves 600 purchased credits into platform stock, allocates to a school, and returns revoked credits",async()=>{
    const fixture=await createTenantFixture();
    const before=await getMessagingInventory(platformSession);
    const beforeSms=before.inventory.find(row=>row.channel==="sms")?.balance??0;

    await recordMessagingPurchase(platformSession,{channel:"sms",quantity:600,unitCost:0.018,providerKey:"arkesel",reference:`TEST-PURCHASE-${fixture.schoolId}`});
    let inventory=await getMessagingInventory(platformSession);
    expect(inventory.inventory.find(row=>row.channel==="sms")?.balance).toBe(beforeSms+600);
    expect(inventory.ledger.find(row=>row.reference===`TEST-PURCHASE-${fixture.schoolId}`)).toMatchObject({channel:"sms",entryType:"purchase",quantity:600,providerKey:"arkesel"});

    await adjustMessagingBalance(platformSession,{schoolId:fixture.schoolId,channel:"sms",quantity:200,unitCost:0.018,unitPrice:0.03,reference:`TEST-SALE-${fixture.schoolId}`});
    let school=await getMessagingWallet(platformSession,fixture.schoolId);
    expect(school.wallet.smsBalance).toBe(200);
    expect(Number(school.platformInventory.sms)).toBe(beforeSms+400);
    expect(school.ledger.find(row=>row.reference===`TEST-SALE-${fixture.schoolId}`)).toMatchObject({entryType:"allocation",quantity:200,balanceAfter:200});

    await adjustMessagingBalance(platformSession,{schoolId:fixture.schoolId,channel:"sms",quantity:-50,unitCost:0.018,unitPrice:0.03,reference:`TEST-RETURN-${fixture.schoolId}`});
    school=await getMessagingWallet(platformSession,fixture.schoolId);
    expect(school.wallet.smsBalance).toBe(150);
    expect(Number(school.platformInventory.sms)).toBe(beforeSms+450);
    expect(school.ledger.find(row=>row.reference===`TEST-RETURN-${fixture.schoolId}`)).toMatchObject({entryType:"refund",quantity:-50,balanceAfter:150});

    // Restore shared platform inventory so this regression leaves no global stock behind.
    await adjustMessagingInventory(platformSession,{channel:"sms",quantity:-450,providerKey:"arkesel",reference:`TEST-CLEANUP-${fixture.schoolId}`});
    inventory=await getMessagingInventory(platformSession);
    expect(inventory.inventory.find(row=>row.channel==="sms")?.balance).toBe(beforeSms);
  });

  it("rejects a school allocation that exceeds platform-owned stock without changing the wallet",async()=>{
    const fixture=await createTenantFixture();
    const inventory=await getMessagingInventory(platformSession);
    const available=inventory.inventory.find(row=>row.channel==="sms")?.balance??0;
    await expect(adjustMessagingBalance(platformSession,{schoolId:fixture.schoolId,channel:"sms",quantity:available+1,unitCost:0.01,unitPrice:0.02,reference:`TEST-OVER-${fixture.schoolId}`})).rejects.toBeTruthy();
    const school=await getMessagingWallet(platformSession,fixture.schoolId);
    expect(school.wallet.smsBalance).toBe(0);
  });
});
