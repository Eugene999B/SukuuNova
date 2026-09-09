import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasPermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { enqueueNotification } from "@/lib/message-outbox";
import { createCalendarEventTx } from "@/lib/calendar-service";
import { getSchoolAuthorization } from "@/lib/authorization";
import { estimateSmsSegments } from "@/lib/sms-segments";
import { getActiveSmsProviderKey, isActiveSmsProviderConfigured } from "@/lib/sms-provider";

type Recipient = { id: string; name: string; phone: string | null };
type JsonRecord = Record<string, unknown>;
type Audience="guardians"|"teachers"|"staff"|"all"|"individual";
const sendSchema = z.object({ action: z.literal("send"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "individual"]), channel: z.enum(["in_app", "sms", "whatsapp"]), userId: z.string().trim().min(1).max(100).optional(), mediaUrl: z.string().url().max(2000).optional() });
const broadcastSchema = z.object({ action: z.literal("broadcast"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000), audience: z.enum(["guardians", "teachers", "staff", "all"]), channel: z.enum(["sms", "whatsapp"]), scheduleAt: z.string().max(40).optional(), mediaUrl: z.string().url().max(2000).optional() });
const MAX_BROADCAST_RECIPIENTS = 1000;
const eventFlag = z.union([z.boolean(), z.string()]).optional();
const eventSchema = z.object({ action: z.literal("create_event"), name: z.string().trim().min(2).max(180), type: z.string().trim().min(2).max(40), startDate: z.string().min(1), endDate: z.string().min(1), location: z.string().optional(), description: z.string().max(5000).optional(), affectsAttendance: eventFlag, affectsTransport: eventFlag, notifyGuardians: eventFlag, notifyStaff: eventFlag });
const STAFF_ROLE_KEYS=["owner","administrator","principal","vice_principal","academic_coordinator","department_head","accountant","hr_officer","admissions_officer","front_desk_security","transport_officer","teacher","class_teacher","subject_teacher"] as const;
const STAFF_ROLE_KEYS_MUTABLE=[...STAFF_ROLE_KEYS];
const TEACHER_ROLE_KEYS=["teacher","class_teacher","subject_teacher","academic_coordinator","department_head"];
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function flag(value: boolean | string | undefined): boolean | undefined { if (value === undefined) return undefined; if (typeof value === "boolean") return value; return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase()); }
function externalBody(title:string,body:string){return `${title}\n\n${body}`;}
async function canCommunicate(schoolId: string, userId: string) { return withTenant(schoolId, async (tx) => { const access = await getSchoolAuthorization(tx, userId); return access.isOwner || await hasPermission(tx, userId, "communications:manage"); }); }
async function canManageCalendar(schoolId:string,userId:string){return withTenant(schoolId,tx=>hasPermission(tx,userId,"calendar:manage"));}

async function recipientsFor(tx:Prisma.TransactionClient,schoolId:string,audience:Audience,userId?:string){
  if(audience==="individual"){
    const user=userId?await tx.user.findFirst({where:{id:userId,schoolId,status:"active"},select:{id:true,name:true,phone:true}}):null;
    return user?[user]:[];
  }
  if(audience==="guardians")return tx.user.findMany({where:{schoolId,status:"active",guardianProfiles:{some:{schoolId}}},select:{id:true,name:true,phone:true},take:MAX_BROADCAST_RECIPIENTS});
  if(audience==="teachers")return tx.user.findMany({where:{schoolId,status:"active",userRoles:{some:{role:{key:{in:STAFF_ROLE_KEYS_MUTABLE.filter(key=>TEACHER_ROLE_KEYS.includes(key))}}}}},select:{id:true,name:true,phone:true},take:MAX_BROADCAST_RECIPIENTS});
  if(audience==="staff")return tx.user.findMany({where:{schoolId,status:"active",userRoles:{some:{role:{key:{in:STAFF_ROLE_KEYS_MUTABLE}}}}},select:{id:true,name:true,phone:true},take:MAX_BROADCAST_RECIPIENTS});
  return tx.user.findMany({where:{schoolId,status:"active"},select:{id:true,name:true,phone:true},take:MAX_BROADCAST_RECIPIENTS});
}

async function wallet(tx:Prisma.TransactionClient,schoolId:string){
  const rows=await tx.$queryRawUnsafe<Array<{smsBalance:number;whatsappBalance:number;smsSellRate:string;whatsappSellRate:string;lowBalanceThreshold:number;status:string}>>(`SELECT "smsBalance","whatsappBalance","smsSellRate"::text,"whatsappSellRate"::text,"lowBalanceThreshold","status" FROM "PlatformMessagingWallet" WHERE "schoolId"=$1`,schoolId);
  return rows[0]??{smsBalance:0,whatsappBalance:0,smsSellRate:"0",whatsappSellRate:"0",lowBalanceThreshold:50,status:"unfunded"};
}
async function preflightCredits(tx:Prisma.TransactionClient,schoolId:string,channel:"sms"|"whatsapp",body:string,recipientCount:number){
  const current=await wallet(tx,schoolId);
  const perRecipient=channel==="sms"?estimateSmsSegments(body).segments:1;
  const required=perRecipient*recipientCount;
  const available=channel==="sms"?current.smsBalance:current.whatsappBalance;
  if(required>available)throw new AppError(`This school needs ${required.toLocaleString()} ${channel.toUpperCase()} credit${required===1?"":"s"} for this send but has ${available.toLocaleString()}. Ask SukuuNova administration to allocate more credits.`,409,"INSUFFICIENT_COMMUNICATION_CREDITS");
  return {required,available,perRecipient,balanceAfter:available-required};
}
async function assertProvider(channel:"sms"|"whatsapp"){
  if(channel==="sms"&&!(await isActiveSmsProviderConfigured()))throw new AppError("The active SukuuNova SMS provider is not configured. Contact platform administration.",503,"SMS_PROVIDER_NOT_CONFIGURED");
  if(channel==="whatsapp"&&(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN||!process.env.TWILIO_WHATSAPP_FROM))throw new AppError("WhatsApp delivery is not configured. Contact platform administration.",503,"WHATSAPP_PROVIDER_NOT_CONFIGURED");
}

export async function GET() {
  try {
    const session=await requireSchoolSession();
    if(!(await canCommunicate(session.schoolId,session.userId)))throw new ForbiddenError("Your account is not authorised to view school communications.");
    const provider=await getActiveSmsProviderKey();
    const data=await withTenant(session.schoolId,async tx=>{
      const [messages,recipients,settings,events,currentWallet]=await Promise.all([
        tx.message.findMany({where:{schoolId:session.schoolId},orderBy:{createdAt:"desc"},take:80,select:{id:true,channel:true,recipientType:true,recipientId:true,body:true,status:true,createdAt:true,sentAt:true,nextAttemptAt:true,lastError:true}}),
        tx.user.findMany({where:{schoolId:session.schoolId,status:"active"},orderBy:{name:"asc"},take:300,select:{id:true,name:true,phone:true,userRoles:{select:{role:{select:{name:true}}}}}}),
        tx.schoolSettings.findUnique({where:{schoolId:session.schoolId},select:{smsSenderId:true,notificationChannels:true,whatsappTemplateConfig:true}}),
        tx.$queryRaw<Array<Record<string,unknown>>>`SELECT "id","schoolId","academicYearId","type","name","startDate","endDate","affectsAttendance","affectsTransport","location","description" FROM "CalendarEvent" WHERE "schoolId"=${session.schoolId} ORDER BY "startDate" ASC LIMIT 80`,
        wallet(tx,session.schoolId),
      ]);
      return {messages,recipients:recipients.map(r=>({id:r.id,name:r.name,phone:r.phone,roles:r.userRoles.map(x=>x.role.name)})),settings:{smsSenderId:settings?.smsSenderId||null,channels:settings?.notificationChannels||[],whatsapp:settings?.whatsappTemplateConfig||{},smsCredits:currentWallet.smsBalance,whatsappCredits:currentWallet.whatsappBalance,smsSellRate:Number(currentWallet.smsSellRate),whatsappSellRate:Number(currentWallet.whatsappSellRate),lowBalanceThreshold:currentWallet.lowBalanceThreshold,walletStatus:currentWallet.status,activeSmsProvider:provider},events};
    });
    return NextResponse.json(data,{headers:{"cache-control":"private, no-store"}});
  }catch(error){return routeError(error);}
}

export async function POST(request:Request){
  try{
    const session=await requireSchoolSession();
    const input=await request.json();
    const communicationAccess=await canCommunicate(session.schoolId,session.userId);
    const calendarAccess=input?.action==="create_event"?await canManageCalendar(session.schoolId,session.userId):false;
    if(!communicationAccess&&!calendarAccess)throw new ForbiddenError("Your account is not authorised to manage this school workspace action.");

    if(input?.action==="send"){
      const value=sendSchema.parse(input);
      if(!communicationAccess)throw new ForbiddenError("Your account is not authorised to manage school communications.");
      if(value.channel!=="in_app")await assertProvider(value.channel);
      return withTenant(session.schoolId,async tx=>{
        const recipients=await recipientsFor(tx,session.schoolId,value.audience,value.userId) as Recipient[];
        if(!recipients.length)return NextResponse.json({ok:true,message:"No recipients matched that audience."});
        const capped=recipients.length>=MAX_BROADCAST_RECIPIENTS;
        const deliverable=recipients.filter(recipient=>Boolean(recipient.phone));
        const messageBody=externalBody(value.title,value.body);
        const credits=value.channel==="in_app"?null:await preflightCredits(tx,session.schoolId,value.channel,messageBody,deliverable.length);
        if(value.channel==="in_app"){
          const batchKey=`direct:${session.schoolId}:${Date.now()}`,now=new Date();
          await tx.message.createMany({data:recipients.map(r=>({schoolId:session.schoolId,channel:"in_app",recipientType:"user",recipientId:r.id,recipientPhone:r.phone||"",body:messageBody,templateKey:"direct_message",templateVariables:{title:value.title},mediaUrl:value.mediaUrl||null,status:"delivered",attempts:1,sentAt:now,nextAttemptAt:now,idempotencyKey:`${batchKey}:${r.id}:in_app`}))});
        }else{
          for(const recipient of deliverable)await enqueueNotification(tx,{schoolId:session.schoolId,recipientType:"user",recipientId:recipient.id,recipientPhone:recipient.phone!,body:messageBody,templateKey:value.channel==="whatsapp"?"school_announcement":undefined,templateVariables:{title:value.title,body:value.body},mediaUrl:value.mediaUrl,channels:value.channel});
        }
        await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:"message.sent",entityType:"MessageBatch",entityId:`message-${Date.now()}`,after:{title:value.title,audience:value.audience,channel:value.channel,recipientCount:deliverable.length,creditsRequired:credits?.required??0}});
        revalidatePath("/school/communications/messages");revalidatePath("/school/communications/broadcasts");revalidatePath("/school/communications/announcements");
        return NextResponse.json({ok:true,credits,message:`Message queued for ${value.channel==="in_app"?recipients.length:deliverable.length} recipient${deliverable.length===1?"":"s"}.${credits?` ${credits.required} credit${credits.required===1?"":"s"} reserved; ${credits.balanceAfter} remain.`:""}${capped?` Limited to ${MAX_BROADCAST_RECIPIENTS} per request — narrow the audience and send again for the rest.`:""}`});
      });
    }

    if(input?.action==="broadcast"){
      const value=broadcastSchema.parse(input);
      if(!communicationAccess)throw new ForbiddenError("Your account is not authorised to manage school communications.");
      await assertProvider(value.channel);
      const scheduledAt=value.scheduleAt?new Date(value.scheduleAt):null;
      if(scheduledAt&&Number.isNaN(scheduledAt.getTime()))return NextResponse.json({error:"INVALID_INPUT",message:"Choose a valid schedule time."},{status:400});
      if(scheduledAt&&scheduledAt.getTime()<=Date.now())return NextResponse.json({error:"INVALID_INPUT",message:"Scheduled broadcast time must be in the future."},{status:400});
      return withTenant(session.schoolId,async tx=>{
        const recipients=await recipientsFor(tx,session.schoolId,value.audience) as Recipient[];
        const deliverable=recipients.filter(recipient=>Boolean(recipient.phone));
        const capped=recipients.length>=MAX_BROADCAST_RECIPIENTS;
        const messageBody=externalBody(value.title,value.body);
        const credits=await preflightCredits(tx,session.schoolId,value.channel,messageBody,deliverable.length);
        let queued=0;
        for(const recipient of deliverable){
          const rows=await enqueueNotification(tx,{schoolId:session.schoolId,recipientType:"user",recipientId:recipient.id,recipientPhone:recipient.phone!,body:messageBody,templateKey:value.channel==="whatsapp"?"school_announcement":undefined,templateVariables:{title:value.title,body:value.body},mediaUrl:value.mediaUrl,scheduledAt:scheduledAt||undefined,channels:value.channel,idempotencyKey:`broadcast:${session.schoolId}:${value.audience}:${value.channel}:${value.title}:${value.body}:${scheduledAt?.toISOString()||"now"}`});
          queued+=rows.length;
        }
        await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:scheduledAt?"broadcast.scheduled":"broadcast.queued",entityType:"Broadcast",entityId:`broadcast-${Date.now()}`,after:{title:value.title,audience:value.audience,channel:value.channel,recipientCount:queued,creditsRequired:credits.required,scheduleAt:scheduledAt?.toISOString()||null}});
        revalidatePath("/school/communications/messages");revalidatePath("/school/communications/broadcasts");
        return NextResponse.json({ok:true,credits,message:scheduledAt?`Broadcast scheduled for ${scheduledAt.toLocaleString("en-GH")}. ${queued} recipient${queued===1?"":"s"} queued; ${credits.required} credit${credits.required===1?"":"s"} reserved and ${credits.balanceAfter} remain.${capped?` Limited to ${MAX_BROADCAST_RECIPIENTS} per request.`:""}`:`Broadcast queued for ${queued} recipient${queued===1?"":"s"}; ${credits.required} credit${credits.required===1?"":"s"} reserved and ${credits.balanceAfter} remain.${capped?` Limited to ${MAX_BROADCAST_RECIPIENTS} per request — narrow the audience and send again for the rest.`:""}`});
      });
    }

    if(input?.action==="create_event"){
      const value=eventSchema.parse(input),start=new Date(value.startDate),end=new Date(value.endDate);
      return withTenant(session.schoolId,async tx=>{
        const year=await tx.academicYear.findFirst({where:{schoolId:session.schoolId},orderBy:{startDate:"desc"}});
        if(!year)throw new Error("Create an academic year before creating calendar events.");
        const result=await createCalendarEventTx(tx,{schoolId:session.schoolId,actorId:session.userId,academicYearId:year.id,type:value.type,name:value.name,startDate:start,endDate:end,...(value.affectsAttendance===undefined?{}:{affectsAttendance:flag(value.affectsAttendance)}),...(value.affectsTransport===undefined?{}:{affectsTransport:flag(value.affectsTransport)}),notifyGuardians:flag(value.notifyGuardians),notifyStaff:flag(value.notifyStaff),location:value.location||null,description:value.description||null});
        revalidatePath("/school/events");revalidatePath("/school/communications/messages");
        return NextResponse.json({ok:true,message:`Event created. ${result.queuedDeliveryJobs} delivery job${result.queuedDeliveryJobs===1?" was":"s were"} queued for ${result.guardianRecipients} guardian and ${result.staffRecipients} staff recipients.`,event:result.event});
      });
    }

    if(input?.action==="save_settings"){
      if(!communicationAccess)throw new ForbiddenError("Your account is not authorised to manage communication settings.");
      const rawChannels:unknown[]=Array.isArray(input.channels)?input.channels:["in_app"];
      const channels=[...new Set(rawChannels.filter((c):c is string=>c==="in_app"||c==="sms"||c==="whatsapp"))];
      if(!channels.length)return NextResponse.json({error:"INVALID_INPUT",message:"Select at least one communication channel."},{status:400});
      const whatsappFrom=typeof input.whatsappFrom==="string"&&input.whatsappFrom.trim()?input.whatsappFrom.trim().slice(0,40):null;
      const reportCardMediaBase=typeof input.reportCardMediaBase==="string"&&input.reportCardMediaBase.trim()?input.reportCardMediaBase.trim().slice(0,2000):null;
      if(reportCardMediaBase){try{new URL(reportCardMediaBase);}catch{return NextResponse.json({error:"INVALID_INPUT",message:"Report-card media base must be a valid URL."},{status:400});}}
      return withTenant(session.schoolId,async tx=>{
        const current=await tx.schoolSettings.findUnique({where:{schoolId:session.schoolId},select:{notificationChannels:true,whatsappTemplateConfig:true}});
        const nextConfig={...asRecord(current?.whatsappTemplateConfig)};
        if(whatsappFrom)Object.assign(nextConfig,{from:whatsappFrom});if(reportCardMediaBase)Object.assign(nextConfig,{reportCardMediaBase});
        const notificationConfig={channels,automation:{payment_received:Boolean(input.payment_received),report_card_ready:Boolean(input.report_card_ready),student_absence:Boolean(input.student_absence),staff_late:Boolean(input.staff_late),transport_boarding:Boolean(input.transport_boarding),emergency_broadcast:Boolean(input.emergency_broadcast)}};
        const smsSenderId=typeof input.smsSenderId==="string"&&input.smsSenderId.trim()?input.smsSenderId.trim().slice(0,20):undefined;
        await tx.schoolSettings.update({where:{schoolId:session.schoolId},data:{smsSenderId,notificationChannels:JSON.parse(JSON.stringify(notificationConfig)) as Prisma.InputJsonValue,whatsappTemplateConfig:JSON.parse(JSON.stringify(nextConfig)) as Prisma.InputJsonValue}});
        await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:"communications.settings_updated",entityType:"SchoolSettings",entityId:session.schoolId,after:JSON.parse(JSON.stringify(notificationConfig))});
        revalidatePath("/school/communications/settings");
        return NextResponse.json({ok:true,message:"Communication settings saved."});
      });
    }
    return NextResponse.json({error:"INVALID_ACTION",message:"Unsupported communication action."},{status:400});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"INVALID_INPUT",message:"Please complete the communication details."},{status:400});
    if(error instanceof ForbiddenError)return NextResponse.json({error:error.code,message:error.message},{status:error.status});
    return routeError(error);
  }
}
