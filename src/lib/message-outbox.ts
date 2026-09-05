import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, withTenant } from "@/lib/db";

export type NotificationTemplateKey="student_absence"|"student_attendance"|"staff_late"|"invoice_created"|"payment_received"|"report_card_ready"|"transport_boarding"|"feeding_notice"|"emergency_broadcast"|"school_announcement";
type RecipientType="guardian"|"staff"|"user";
type Channel="sms"|"whatsapp";

type NotificationInput={schoolId:string; recipientType:RecipientType; recipientId:string; recipientPhone:string; body:string; templateKey?:NotificationTemplateKey; templateVariables?:Record<string,string>; mediaUrl?:string; idempotencyKey?:string; scheduledAt?:Date};
type NotificationSenders={sms?:SmsSender;whatsapp?:WhatsAppSender};

const MAX_ATTEMPTS=5;
const BASE_RETRY_DELAY_MS=30_000;
const MAX_RETRY_DELAY_MS=2*60*60_000;
const JITTER_MAX_MS=5_000;
const CLAIM_LEASE_MS=10*60_000;

function configuredChannels(value:Prisma.JsonValue|null|undefined):Channel[]{
  const candidate = !Array.isArray(value) && value && typeof value === "object" ? (value as Record<string,Prisma.JsonValue>).channels : value;
  if(!Array.isArray(candidate))return["sms"];
  const channels=candidate.filter((item):item is Channel=>item==="sms"||item==="whatsapp");
  return channels.length?[...new Set(channels)]:["sms"];
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

export type SmsSender=(input:{phone:string;body:string;senderId?:string})=>Promise<void>;
export type WhatsAppSender=(input:{phone:string;contentSid:string;variables:Record<string,string>;mediaUrl?:string})=>Promise<void>;
export const httpSmsSender:SmsSender=async({phone,body,senderId})=>{
  const url=process.env.SMS_PROVIDER_URL,token=process.env.SMS_PROVIDER_TOKEN;
  if(!url||!token)throw new Error("SMS provider is not configured.");
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({to:phone,body,senderId:senderId||process.env.SMS_SENDER_ID}),signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`SMS provider HTTP ${response.status}`);
};
export const twilioWhatsAppSender:WhatsAppSender=async({phone,contentSid:sid,variables})=>{
  const accountSid=process.env.TWILIO_ACCOUNT_SID,authToken=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_WHATSAPP_FROM;
  if(!accountSid||!authToken||!from)throw new Error("Twilio WhatsApp is not configured.");
  const form=new URLSearchParams({To:phone.startsWith("whatsapp:")?phone:"whatsapp:"+phone,From:from.startsWith("whatsapp:")?from:"whatsapp:"+from,ContentSid:sid,ContentVariables:JSON.stringify(variables)});
  const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(accountSid)+"/Messages.json",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",authorization:"Basic "+Buffer.from(accountSid+":"+authToken).toString("base64")},body:form,signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`Twilio WhatsApp HTTP ${response.status}`);
};
function variables(value:Prisma.JsonValue|null){ if(!value||Array.isArray(value)||typeof value!=="object")return{}; return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==="string")); }
export function permanentFailure(message:string){ return /HTTP (400|401|403|404)\b|is not configured|no .*configured|no .*template|unsupported message channel|sender is unavailable/i.test(message) && !/HTTP 5\d\d\b|service unavailable|timeout|timed out|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(message); }
function nextRetryAt(attempt:number){ const exponent=Math.max(attempt-1,0); const exponential=Math.min(MAX_RETRY_DELAY_MS,BASE_RETRY_DELAY_MS*Math.pow(2,exponent)); const jitter=Math.floor(Math.random()*(JITTER_MAX_MS+1)); return new Date(Date.now()+exponential+jitter); }
function deterministicIdempotencyKey(input:NotificationInput,channel:Channel){ const explicit=input.idempotencyKey?.trim(); if(explicit)return `${explicit}:${channel}`; if(!input.templateKey)return `manual:${randomBytes(16).toString("hex")}:${channel}`; const digest=createHash("sha256").update(input.schoolId+"|"+input.templateKey+"|"+input.recipientId+"|"+input.body+"|"+JSON.stringify(input.templateVariables??{})).digest("hex"); return `${input.schoolId}:${input.templateKey}:${input.recipientId}:v1:${digest}:${channel}`; }

async function sendExternalNotification(
  message: { channel: string; recipientPhone: string; body: string; templateKey: string | null; templateVariables: Prisma.JsonValue | null; mediaUrl: string | null },
  settings: { smsSenderId?: string | null; whatsappTemplateConfig?: Prisma.JsonValue | null } | null | undefined,
  senders: NotificationSenders = { sms: httpSmsSender, whatsapp: twilioWhatsAppSender }
) {
  if (message.channel === "sms") {
    if (!senders.sms) throw new Error("SMS sender is unavailable.");
    await senders.sms({ phone: message.recipientPhone, body: message.body, senderId: settings?.smsSenderId || undefined });
  } else if (message.channel === "whatsapp") {
    if (!senders.whatsapp) throw new Error("WhatsApp sender is unavailable.");
    if (!message.templateKey) throw new Error("WhatsApp job has no approved template key.");
    const sid = contentSid(settings?.whatsappTemplateConfig, message.templateKey);
    if (!sid) throw new Error("No Twilio ContentSid is configured for " + message.templateKey + ".");
    const messageVariables = variables(message.templateVariables);
    if (message.mediaUrl) messageVariables[mediaVariableKey(settings?.whatsappTemplateConfig, message.templateKey)] = message.mediaUrl;
    await senders.whatsapp({ phone: message.recipientPhone, contentSid: sid, variables: messageVariables, mediaUrl: message.mediaUrl || undefined });
  } else {
    throw new Error("Unsupported message channel: " + message.channel);
  }
}

export async function deliverCreatedMessage(
  tx: Prisma.TransactionClient,
  message: { id: string; schoolId: string; channel: string; recipientPhone: string; body: string; templateKey: string | null; templateVariables: Prisma.JsonValue | null; mediaUrl: string | null; attempts: number },
  settings: { smsSenderId?: string | null; whatsappTemplateConfig?: Prisma.JsonValue | null } | null | undefined,
  senders: NotificationSenders = { sms: httpSmsSender, whatsapp: twilioWhatsAppSender }
) {
  const claimedAttempt = message.attempts;
  try {
    await sendExternalNotification(message, settings, senders);
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
  const settings=await tx.schoolSettings.findUnique({where:{schoolId:input.schoolId}}); const channels=configuredChannels(settings?.notificationChannels); const messages=[]; const nextAttemptAt=input.scheduledAt && input.scheduledAt.getTime()>Date.now()?input.scheduledAt:new Date();
  for(const channel of channels){ if(channel==="whatsapp"&&!input.templateKey)continue; const idempotencyKey=deterministicIdempotencyKey(input,channel); const existing=await tx.message.findFirst({where:{schoolId:input.schoolId,idempotencyKey},orderBy:{createdAt:"asc"}}); if(existing){messages.push(existing);continue;} try{ const message=await tx.message.create({data:{schoolId:input.schoolId,channel,recipientType:input.recipientType,recipientId:input.recipientId,recipientPhone:input.recipientPhone,body:input.body,templateKey:input.templateKey,templateVariables:input.templateVariables,mediaUrl:input.mediaUrl,status:"queued",attempts:0,nextAttemptAt,idempotencyKey}}); messages.push(message);}catch(error){ if((error as {code?:string}).code!=="P2002")throw error; const existingAfterRace=await tx.message.findFirst({where:{schoolId:input.schoolId,idempotencyKey},orderBy:{createdAt:"asc"}}); if(!existingAfterRace)throw error; messages.push(existingAfterRace); } }
  return messages;
}
export const enqueueSms=enqueueNotification;

export async function processMessageBatchOnce(senders:NotificationSenders={sms:httpSmsSender,whatsapp:twilioWhatsAppSender},batchSize=20,schoolIdFilter?:string){
  const directories=await db.schoolLoginDirectory.findMany({where:{status:"active",...(schoolIdFilter?{schoolId:schoolIdFilter}:{})}}); let processed=0;
  const availableChannels = (Object.keys(senders) as Channel[]).filter((c) => senders[c]);
  for(const directory of directories){
    if(processed>=batchSize)break;
    const now=new Date();
    const jobs=await withTenant(directory.schoolId,tx=>tx.message.findMany({where:{channel:{in:availableChannels.length?availableChannels:["sms","whatsapp"]},OR:[{status:"queued",nextAttemptAt:{lte:now}},{status:"sending",nextAttemptAt:{lte:now}}]},orderBy:[{nextAttemptAt:"asc"},{createdAt:"asc"}],take:batchSize-processed}));
    for(const job of jobs){
      const leaseUntil=new Date(Date.now()+CLAIM_LEASE_MS);
      const claimableStatus=job.status==="queued" ? {status:"queued",nextAttemptAt:{lte:new Date()}} : {status:"sending",nextAttemptAt:{lte:new Date()}};
      const claimed=await withTenant(directory.schoolId,tx=>tx.message.updateMany({where:{id:job.id,...claimableStatus},data:{status:"sending",attempts:{increment:1},nextAttemptAt:leaseUntil}}));
      if(claimed.count===0)continue;
      const settings=await withTenant(directory.schoolId,tx=>tx.schoolSettings.findUnique({where:{schoolId:directory.schoolId}}));
      const claimedJob={...job,schoolId:directory.schoolId,attempts:job.attempts+1};
      const claimedAttempt=claimedJob.attempts;
      try {
        await sendExternalNotification(claimedJob, settings, senders);
        await withTenant(directory.schoolId, tx => tx.message.updateMany({ where: { id: claimedJob.id, status: "sending", attempts: claimedAttempt }, data: { status: "sent", sentAt: new Date(), lastError: null, nextAttemptAt: new Date() } }));
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
    }
  }
  return processed;
}
export async function processSmsBatchOnce(sender:SmsSender=httpSmsSender,batchSize=20,schoolIdFilter?:string){return processMessageBatchOnce({sms:sender},batchSize,schoolIdFilter);}