import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, withTenant } from "@/lib/db";
import { estimateSmsSegments } from "./sms-segments";
import { sendSmsThroughActiveProvider, type SmsSendResult } from "./sms-provider";

export type NotificationTemplateKey="student_absence"|"student_attendance"|"staff_late"|"invoice_created"|"payment_received"|"report_card_ready"|"transport_boarding"|"feeding_notice"|"emergency_broadcast"|"school_announcement";
type RecipientType="guardian"|"staff"|"user";
type Channel="sms"|"whatsapp";

type NotificationInput={schoolId:string; recipientType:RecipientType; recipientId:string; recipientPhone:string; body:string; templateKey?:NotificationTemplateKey; templateVariables?:Record<string,string>; mediaUrl?:string; idempotencyKey?:string; scheduledAt?:Date; channels?:Channel|Channel[]};
type NotificationSenders={sms?:SmsSender;whatsapp?:WhatsAppSender};

const MAX_ATTEMPTS=5;
const BASE_RETRY_DELAY_MS=30_000;
const MAX_RETRY_DELAY_MS=2*60*60_000;
const JITTER_MAX_MS=5_000;
const CLAIM_LEASE_MS=10*60_000;

function configuredChannels(value:Prisma.JsonValue|null|undefined,explicit?:Channel|Channel[]):Channel[]{
  if(explicit){
    const requested=Array.isArray(explicit)?explicit:[explicit];
    return [...new Set(requested.filter((channel):channel is Channel=>channel==="sms"||channel==="whatsapp"))];
  }
  const candidate = !Array.isArray(value) && value && typeof value==="object" ? (value as Record<string,Prisma.JsonValue>).channels : value;
  if(!Array.isArray(candidate))return[];
  return [...new Set(candidate.filter((item):item is Channel=>item==="sms"||item==="whatsapp"))];
}
function contentSid(value:Prisma.JsonValue|null|undefined,key:string){
  if(!value||Array.isArray(value)||typeof value!=="object")return undefined;
  const candidate=(value as Record<string,Prisma.JsonValue>)[key];
  if(typeof candidate==="string")return candidate;
  if(candidate&&!Array.isArray(candidate)&&typeof candidate==="object"){
    const sid=(candidate as Record<string,Prisma.JsonValue>).contentSid;
    return typeof sid==="string"?sid:undefined;
  }
  return undefined;
}
function mediaVariableKey(value:Prisma.JsonValue|null|undefined,key:string){
  if(!value||Array.isArray(value)||typeof value!=="object")return "mediaUrl";
  const candidate=(value as Record<string,Prisma.JsonValue>)[key];
  if(candidate&&!Array.isArray(candidate)&&typeof candidate==="object"){
    const mediaKey=(candidate as Record<string,Prisma.JsonValue>).mediaVariableKey;
    if(typeof mediaKey==="string"&&mediaKey.trim())return mediaKey;
  }
  return "mediaUrl";
}
function withSchoolIdentity(schoolName:string|undefined,body:string){
  const name=schoolName?.trim();
  if(!name)return body;
  if(body.trimStart().toLocaleLowerCase().startsWith(name.toLocaleLowerCase()))return body;
  return `${name}: ${body}`;
}

export type SmsSender=(input:{phone:string;body:string;senderId?:string})=>Promise<SmsSendResult|void>;
export type WhatsAppSender=(input:{phone:string;contentSid:string;variables:Record<string,string>;mediaUrl?:string})=>Promise<void>;
// Kept under the historic export name so reset delivery and workers need no parallel sender path.
export const httpSmsSender:SmsSender=sendSmsThroughActiveProvider;
export const twilioWhatsAppSender:WhatsAppSender=async({phone,contentSid:sid,variables})=>{
  const accountSid=process.env.TWILIO_ACCOUNT_SID,authToken=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_WHATSAPP_FROM;
  if(!accountSid||!authToken||!from)throw new Error("Twilio WhatsApp is not configured.");
  const form=new URLSearchParams({To:phone.startsWith("whatsapp:")?phone:"whatsapp:"+phone,From:from.startsWith("whatsapp:")?from:"whatsapp:"+from,ContentSid:sid,ContentVariables:JSON.stringify(variables)});
  const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(accountSid)+"/Messages.json",{signal:AbortSignal.timeout(15_000),method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",authorization:"Basic "+Buffer.from(accountSid+":"+authToken).toString("base64"),},body:form});
  if(!response.ok)throw new Error(`Twilio WhatsApp HTTP ${response.status}`);
};
function variables(value:Prisma.JsonValue|null){ if(!value||Array.isArray(value)||typeof value!=="object")return{}; return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==="string")); }
function permanentFailure(message:string){ return /HTTP (400|401|403|404)\b|no .*configured|not configured|no .*template|unsupported message channel|unavailable/i.test(message); }
function nextRetryAt(attempt:number){ const exponent=Math.max(attempt-1,0); const exponential=Math.min(MAX_RETRY_DELAY_MS,BASE_RETRY_DELAY_MS*Math.pow(2,exponent)); const jitter=Math.floor(Math.random()*(JITTER_MAX_MS+1)); return new Date(Date.now()+exponential+jitter); }
function deterministicIdempotencyKey(input:NotificationInput,channel:Channel){ const explicit=input.idempotencyKey?.trim(); if(explicit)return `${explicit}:${input.recipientType}:${input.recipientId}:${channel}`; if(!input.templateKey)return `manual:${randomBytes(16).toString("hex")}:${input.recipientType}:${input.recipientId}:${channel}`; const digest=createHash("sha256").update(input.schoolId+"|"+input.templateKey+"|"+input.recipientId+"|"+input.body+"|"+JSON.stringify(input.templateVariables??{})).digest("hex"); return `${input.schoolId}:${input.templateKey}:${input.recipientId}:v1:${digest}:${channel}`; }

async function sendExternalNotification(
  message: { channel: string; recipientPhone: string; body: string; templateKey: string | null; templateVariables: Prisma.JsonValue | null; mediaUrl: string | null },
  settings: { smsSenderId?: string | null; whatsappTemplateConfig?: Prisma.JsonValue | null } | null | undefined,
  senders: NotificationSenders = { sms: httpSmsSender, whatsapp: twilioWhatsAppSender }
): Promise<SmsSendResult|void> {
  if (message.channel === "sms") {
    if (!senders.sms) throw new Error("SMS sender is unavailable.");
    return senders.sms({ phone: message.recipientPhone, body: message.body });
  }
  if (message.channel === "whatsapp") {
    if (!senders.whatsapp) throw new Error("WhatsApp sender is unavailable.");
    if (!message.templateKey) throw new Error("WhatsApp job has no approved template key.");
    const sid = contentSid(settings?.whatsappTemplateConfig, message.templateKey);
    if (!sid) throw new Error("No Twilio ContentSid is configured for " + message.templateKey + ".");
    const messageVariables = variables(message.templateVariables);
    if (message.mediaUrl) messageVariables[mediaVariableKey(settings?.whatsappTemplateConfig, message.templateKey)] = message.mediaUrl;
    await senders.whatsapp({ phone: message.recipientPhone, contentSid: sid, variables: messageVariables, mediaUrl: message.mediaUrl || undefined });
    return;
  }
  throw new Error("Unsupported message channel: " + message.channel);
}

async function recordSmsProviderDelivery(tx: Prisma.TransactionClient, message: { id:string; schoolId:string; body:string }, result: SmsSendResult|void) {
  if (!result) return;
  const estimatedCredits=estimateSmsSegments(message.body).segments;
  await tx.$executeRawUnsafe(
    `INSERT INTO "SmsProviderDelivery" ("id","schoolId","messageId","providerKey","providerMessageId","estimatedCredits","providerCreditsUsed","status","acceptedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'SUBMITTED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("schoolId","messageId") DO UPDATE SET "providerKey"=EXCLUDED."providerKey","providerMessageId"=COALESCE(EXCLUDED."providerMessageId","SmsProviderDelivery"."providerMessageId"),"providerCreditsUsed"=COALESCE(EXCLUDED."providerCreditsUsed","SmsProviderDelivery"."providerCreditsUsed"),"status"='SUBMITTED',"acceptedAt"=COALESCE("SmsProviderDelivery"."acceptedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP`,
    `sms_${message.id}`,message.schoolId,message.id,result.providerKey,result.providerMessageId??null,estimatedCredits,result.creditsUsed??null,
  );
}

export async function deliverCreatedMessage(
  tx: Prisma.TransactionClient,
  message: { id: string; schoolId: string; channel: string; recipientPhone: string; body: string; templateKey: string | null; templateVariables: Prisma.JsonValue | null; mediaUrl: string | null; attempts: number },
  settings: { smsSenderId?: string | null; whatsappTemplateConfig?: Prisma.JsonValue | null } | null | undefined,
  senders: NotificationSenders = { sms: httpSmsSender, whatsapp: twilioWhatsAppSender }
) {
  const claimedAttempt = message.attempts;
  try {
    const delivery=await sendExternalNotification(message, settings, senders);
    if(message.channel==="sms")await recordSmsProviderDelivery(tx,message,delivery);
    await tx.message.updateMany({ where: { id: message.id, status: "sending", attempts: claimedAttempt }, data: { status: "sent", sentAt: new Date(), lastError: null, nextAttemptAt: new Date() } });
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 500) : "Unknown message error";
    console.error("SukuuNova notification delivery failed", { messageId: message.id, schoolId: message.schoolId, lastError, attempts: claimedAttempt });
    if (permanentFailure(lastError) || claimedAttempt >= MAX_ATTEMPTS) {
      await tx.message.updateMany({ where: { id: message.id, status: "sending", attempts: claimedAttempt }, data: { status: "failed", lastError, nextAttemptAt: new Date() } });
    } else {
      await tx.message.updateMany({ where: { id: message.id, status: "sending", attempts: claimedAttempt }, data: { status: "queued", lastError, nextAttemptAt: nextRetryAt(claimedAttempt) } });
    }
  }
}

export async function enqueueNotification(tx:Prisma.TransactionClient,input:NotificationInput){
  const settings=await tx.schoolSettings.findUnique({where:{schoolId:input.schoolId}});
  const channels=configuredChannels(settings?.notificationChannels,input.channels);
  const school=channels.includes("sms")?await tx.school.findUnique({where:{id:input.schoolId},select:{name:true}}):null;
  const smsBody=withSchoolIdentity(school?.name,input.body);
  const messages=[];
  const nextAttemptAt=input.scheduledAt && input.scheduledAt.getTime()>Date.now()?input.scheduledAt:new Date();
  for(const channel of channels){
    if(channel==="whatsapp"&&!input.templateKey)continue;
    const idempotencyKey=deterministicIdempotencyKey(input,channel);
    const existing=await tx.message.findFirst({where:{idempotencyKey},orderBy:{createdAt:"asc"}});
    if(existing){messages.push(existing);continue;}
    try{
      const body=channel==="sms"?smsBody:input.body;
      const message=await tx.message.create({data:{schoolId:input.schoolId,channel,recipientType:input.recipientType,recipientId:input.recipientId,recipientPhone:input.recipientPhone,body,templateKey:input.templateKey,templateVariables:input.templateVariables,mediaUrl:input.mediaUrl,status:"queued",attempts:0,nextAttemptAt,idempotencyKey}});
      messages.push(message);
    }catch(error){
      if((error as {code?:string}).code!=="P2002")throw error;
      const existingAfterRace=await tx.message.findFirst({where:{idempotencyKey},orderBy:{createdAt:"asc"}});
      if(!existingAfterRace)throw error;
      messages.push(existingAfterRace);
    }
  }
  return messages;
}
/** One settings read and one school read per audience, with bounded bulk inserts.
 * Wallet reservations remain enforced by the database message triggers. */
export async function enqueueNotificationBatch(tx: Prisma.TransactionClient, inputs: NotificationInput[]) {
  if (!inputs.length) return [];
  const schoolId = inputs[0].schoolId;
  if (inputs.some(input => input.schoolId !== schoolId)) throw new Error("A notification batch must belong to one school.");
  const [settings, school] = await Promise.all([
    tx.schoolSettings.findUnique({where:{schoolId}}),
    tx.school.findUnique({where:{id:schoolId},select:{name:true}}),
  ]);
  const jobs = new Map<string, Prisma.MessageCreateManyInput>();
  for (const input of inputs) for (const channel of configuredChannels(settings?.notificationChannels,input.channels)) {
    if (channel === "whatsapp" && !input.templateKey) continue;
    const idempotencyKey = deterministicIdempotencyKey(input,channel);
    jobs.set(idempotencyKey,{
      schoolId,channel,recipientType:input.recipientType,recipientId:input.recipientId,
      recipientPhone:input.recipientPhone,body:channel === "sms" ? withSchoolIdentity(school?.name,input.body) : input.body,
      templateKey:input.templateKey,templateVariables:input.templateVariables,mediaUrl:input.mediaUrl,
      status:"queued",attempts:0,nextAttemptAt:input.scheduledAt && input.scheduledAt > new Date() ? input.scheduledAt : new Date(),idempotencyKey,
    });
  }
  const keys = [...jobs.keys()];
  if (!keys.length) return [];
  // Serialize duplicate requests before wallet-triggered INSERTs. Do not use
  // skipDuplicates: BEFORE INSERT wallet triggers may run on a skipped conflict.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "notification-batch:" + schoolId);
  const existing = await tx.message.findMany({where:{idempotencyKey:{in:keys}},select:{id:true,idempotencyKey:true,status:true}});
  const existingKeys = new Set(existing.map(row => row.idempotencyKey));
  const pending = [...jobs.values()].filter(row => !existingKeys.has(row.idempotencyKey ?? null));
  for (let offset = 0; offset < pending.length; offset += 200)
    await tx.message.createMany({data:pending.slice(offset,offset+200)});
  return tx.message.findMany({where:{idempotencyKey:{in:keys}},select:{id:true,status:true}});
}

export const enqueueSms=enqueueNotification;

let nextSchoolIndex = 0;

export async function processMessageBatchOnce(senders:NotificationSenders={sms:httpSmsSender,whatsapp:twilioWhatsAppSender},batchSize=20,schoolIdFilter?:string){
  const directories=await db.schoolLoginDirectory.findMany({where:{status:"active",...(schoolIdFilter?{schoolId:schoolIdFilter}:{})}}); let processed=0;
  const start = directories.length ? nextSchoolIndex % directories.length : 0;
  const ordered = [...directories.slice(start), ...directories.slice(0,start)];
  for(const directory of ordered){
    // The permanent demonstration fixture contains invented phone numbers.
    // Its lifecycle rows must never reach a real carrier.
    if (directory.uniqueCode.toLowerCase() === "eug123") continue;
    nextSchoolIndex = (directories.indexOf(directory) + 1) % Math.max(1,directories.length);
    if(processed>=batchSize)break;
    const now=new Date();
    const jobs=await withTenant(directory.schoolId,tx=>tx.message.findMany({where:{channel:{in:Object.keys(senders).filter(channel => channel === "sms" || channel === "whatsapp")},OR:[{status:"queued",nextAttemptAt:{lte:now}},{status:"sending",nextAttemptAt:{lte:now}}]},orderBy:[{nextAttemptAt:"asc"},{createdAt:"asc"}],take:batchSize-processed}));
    const settings=jobs.length ? await withTenant(directory.schoolId,tx=>tx.schoolSettings.findUnique({where:{schoolId:directory.schoolId}})) : null;
    for(let offset=0;offset<jobs.length;offset+=4){
      await Promise.all(jobs.slice(offset,offset+4).map(async job=>{
      const leaseUntil=new Date(Date.now()+CLAIM_LEASE_MS);
      const claimableStatus=job.status==="queued" ? {status:"queued",nextAttemptAt:{lte:new Date()}} : {status:"sending",nextAttemptAt:{lte:new Date()}};
      const claimed=await withTenant(directory.schoolId,tx=>tx.message.updateMany({where:{id:job.id,...claimableStatus},data:{status:"sending",attempts:{increment:1},nextAttemptAt:leaseUntil}}));
      if(claimed.count===0)return;
      const claimedJob={...job,schoolId:directory.schoolId,attempts:job.attempts+1};
      const claimedAttempt=claimedJob.attempts;
      try {
        const delivery=await sendExternalNotification(claimedJob, settings, senders);
        await withTenant(directory.schoolId, async tx => {
          if(claimedJob.channel==="sms")await recordSmsProviderDelivery(tx,claimedJob,delivery);
          await tx.message.updateMany({ where: { id: claimedJob.id, status: "sending", attempts: claimedAttempt }, data: { status: "sent", sentAt: new Date(), lastError: null, nextAttemptAt: new Date() } });
        });
      } catch (error) {
        const lastError = error instanceof Error ? error.message.slice(0, 500) : "Unknown message error";
        console.error("SukuuNova notification delivery failed", { messageId: claimedJob.id, schoolId: claimedJob.schoolId, lastError, attempts: claimedAttempt });
        if (permanentFailure(lastError) || claimedAttempt >= MAX_ATTEMPTS) {
          await withTenant(directory.schoolId, tx => tx.message.updateMany({ where: { id: claimedJob.id, status: "sending", attempts: claimedAttempt }, data: { status: "failed", lastError, nextAttemptAt: new Date() } }));
        } else {
          await withTenant(directory.schoolId, tx => tx.message.updateMany({ where: { id: claimedJob.id, status: "sending", attempts: claimedAttempt }, data: { status: "queued", lastError, nextAttemptAt: nextRetryAt(claimedAttempt) } }));
        }
      }
      processed++;
      }));
    }
  }
  return processed;
}
export async function processSmsBatchOnce(sender:SmsSender=httpSmsSender,batchSize=20,schoolIdFilter?:string){return processMessageBatchOnce({sms:sender},batchSize,schoolIdFilter);}
