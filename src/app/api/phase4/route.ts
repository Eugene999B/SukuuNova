import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { addGroupBranch, createSchoolGroup, createSupportTicket, listAiDrafts, listSupportTickets, ownerGroupReport } from "@/lib/phase4-service";
import { riskFlags, schoolImpersonationNotice } from "@/lib/phase4-ops-service";
import { createStructuredAiDraft, acceptStructuredAiDraft, discardStructuredAiDraft } from "@/lib/ai-assistant-service";
import { confirmEmergencySnapshot, prepareEmergencySnapshot } from "@/lib/emergency-broadcast-service";

const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("createTicket"),subject:z.string().min(2).max(240),body:z.string().min(1).max(5000)}),
 z.object({action:z.literal("aiGenerate"),type:z.enum(["lesson_note","report_card_remark"]),context:z.record(z.string(),z.unknown())}),
 z.object({action:z.literal("aiAccept"),draftId:z.string(),editedText:z.string().max(5000).optional()}),
 z.object({action:z.literal("aiDiscard"),draftId:z.string()}),
 z.object({action:z.literal("emergencyPrepare"),message:z.string().min(5).max(500)}),
 z.object({action:z.literal("emergencyConfirm"),confirmationToken:z.string().min(20),message:z.string().min(5).max(500)}),
 z.object({action:z.literal("groupCreate"),name:z.string().min(2).max(160),memberSchoolIds:z.array(z.string()).max(50)}),
 z.object({action:z.literal("groupAddBranch"),groupId:z.string(),branchSchoolId:z.string()})
]);

export async function GET(){try{const session=await requireSchoolSession();const data=await withTenant(session.schoolId,async(tx)=>{const canRisk=await hasPermission(tx,session.userId,"risk_flags:view"),canAi=await hasPermission(tx,session.userId,"ai_drafts:accept"),isOwner=Boolean(await tx.userRole.findFirst({where:{userId:session.userId,role:{key:"owner"}},select:{userId:true}}));const[support,notice,risk,drafts,groupReport]=await Promise.all([listSupportTickets(session.schoolId,session.userId),schoolImpersonationNotice(session.schoolId,session.userId),canRisk?riskFlags(session.schoolId,session.userId):Promise.resolve([]),canAi?listAiDrafts(session.schoolId,session.userId):Promise.resolve([]),isOwner?ownerGroupReport({schoolId:session.schoolId,actorId:session.userId}):Promise.resolve([])]);return{support,notice,risk,drafts,groupReport};});return NextResponse.json(data);}catch(error){return routeError(error);}}

export async function POST(request:Request){try{const session=await requireSchoolSession();const input=await parseJson(request,schema);switch(input.action){case"createTicket":return NextResponse.json({ok:true,result:await createSupportTicket({schoolId:session.schoolId,actorId:session.userId,subject:input.subject,body:input.body})},{status:201});case"aiGenerate":return NextResponse.json({ok:true,result:await createStructuredAiDraft({schoolId:session.schoolId,actorId:session.userId,type:input.type,context:input.context})},{status:201});case"aiAccept":return NextResponse.json({ok:true,result:await acceptStructuredAiDraft({schoolId:session.schoolId,actorId:session.userId,draftId:input.draftId,editedText:input.editedText})});case"aiDiscard":return NextResponse.json({ok:true,result:await discardStructuredAiDraft({schoolId:session.schoolId,actorId:session.userId,draftId:input.draftId})});case"emergencyPrepare":return NextResponse.json({ok:true,result:await withTenant(session.schoolId,(tx)=>prepareEmergencySnapshot(tx,{schoolId:session.schoolId,actorId:session.userId,message:input.message}))});case"emergencyConfirm":return NextResponse.json({ok:true,result:await withTenant(session.schoolId,(tx)=>confirmEmergencySnapshot(tx,{schoolId:session.schoolId,actorId:session.userId,confirmationToken:input.confirmationToken,message:input.message}))});case"groupCreate":return NextResponse.json({ok:true,result:await createSchoolGroup({schoolId:session.schoolId,actorId:session.userId,name:input.name,memberSchoolIds:input.memberSchoolIds})},{status:201});case"groupAddBranch":return NextResponse.json({ok:true,result:await addGroupBranch({schoolId:session.schoolId,actorId:session.userId,groupId:input.groupId,branchSchoolId:input.branchSchoolId})});}}catch(error){return routeError(error);}}