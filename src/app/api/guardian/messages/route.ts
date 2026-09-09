import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

const sendSchema=z.object({action:z.literal("send"),title:z.string().trim().min(2).max(160),body:z.string().trim().min(1).max(5000),recipientId:z.string().trim().min(1).max(100)});
const readSchema=z.object({action:z.literal("mark_read"),messageId:z.string().min(1).max(120)});
function meta(v:unknown){return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function payload(title:string,id:string,name:string,extra:Record<string,unknown>={}){return JSON.parse(JSON.stringify({title,senderType:"guardian",senderId:id,senderName:name,attachments:[],...extra}));}

export async function GET(){
 try{
  const session=await requireGuardianSession();
  return withTenant(session.schoolId,async tx=>{
   const linked=await tx.guardian.findFirst({where:{id:session.guardianId,schoolId:session.schoolId,userId:session.userId},select:{id:true}});
   if(!linked)throw new ForbiddenError("Guardian messaging is not available for this account.");
   const rows=await tx.message.findMany({where:{schoolId:session.schoolId,channel:"in_app",recipientId:session.userId},orderBy:{createdAt:"desc"},take:100,select:{id:true,body:true,status:true,createdAt:true,templateVariables:true,mediaUrl:true}});
   return NextResponse.json({messages:rows.map(m=>{const p=meta(m.templateVariables);return{...m,title:typeof p.title==="string"?p.title:m.body.split("\n")[0],senderName:typeof p.senderName==="string"?p.senderName:"School communication",senderId:typeof p.senderId==="string"?p.senderId:null,readAt:typeof p.readAt==="string"?p.readAt:null,attachments:Array.isArray(p.attachments)?p.attachments:[]}}),unreadCount:rows.filter(m=>!meta(m.templateVariables).readAt).length});
  });
 }catch(error){return routeError(error)}
}

export async function POST(request:Request){
 try{
  const session=await requireGuardianSession();
  const raw=await request.json();
  return withTenant(session.schoolId,async tx=>{
   const linked=await tx.guardian.findFirst({where:{id:session.guardianId,schoolId:session.schoolId,userId:session.userId},select:{id:true}});
   if(!linked)throw new ForbiddenError("Guardian messaging is not available for this account.");
   if(raw?.action==="mark_read"){
    const value=readSchema.parse(raw);
    const m=await tx.message.findFirst({where:{id:value.messageId,schoolId:session.schoolId,recipientId:session.userId,channel:"in_app"},select:{id:true,body:true,templateVariables:true}});
    if(!m)return NextResponse.json({error:"NOT_FOUND",message:"Message not found."},{status:404});
    const p=meta(m.templateVariables);
    const readMeta={...p,readAt:new Date().toISOString()};
    await tx.message.update({where:{id:m.id},data:{status:"read",templateVariables:JSON.parse(JSON.stringify({
      title:String(p.title||m.body.split("\n")[0]),
      senderType:typeof p.senderType==="string"?p.senderType:"school_user",
      senderId:typeof p.senderId==="string"?p.senderId:"system",
      senderName:typeof p.senderName==="string"?p.senderName:"School communication",
      attachments:Array.isArray(p.attachments)?p.attachments:[],
      ...readMeta
    }))}});
    return NextResponse.json({ok:true});
   }
   const input=sendSchema.parse(raw);
   const target=await tx.user.findFirst({where:{id:input.recipientId,schoolId:session.schoolId,status:"active"},select:{id:true,name:true,phone:true,guardianProfiles:{select:{id:true}}}});
   if(!target)return NextResponse.json({error:"NOT_FOUND",message:"Recipient not found."},{status:404});
   if(target.guardianProfiles.length>0)throw new ForbiddenError("Families may message school staff directly, not other family accounts.");
   const message=await tx.message.create({data:{schoolId:session.schoolId,channel:"in_app",recipientType:"user",recipientId:target.id,recipientPhone:target.phone||"",body:`${input.title}\n\n${input.body}`,templateKey:"direct_message",templateVariables:payload(input.title,session.userId,session.name),status:"delivered",attempts:1,sentAt:new Date(),nextAttemptAt:new Date(),idempotencyKey:`guardian:${session.schoolId}:${session.userId}:${target.id}:${Date.now()}:${randomBytes(5).toString("hex")}`},select:{id:true}});
   await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:"message.sent",entityType:"Message",entityId:message.id,after:{title:input.title,recipientId:target.id,channel:"in_app",guardianDirectMessage:true}});
   return NextResponse.json({ok:true,message:`Delivered to ${target.name}.`});
  });
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"INVALID_INPUT",message:"Choose a recipient and complete the message."},{status:400});
  if(error instanceof ForbiddenError)return NextResponse.json({error:error.code,message:error.message},{status:error.status});
  return routeError(error)
 }
}
