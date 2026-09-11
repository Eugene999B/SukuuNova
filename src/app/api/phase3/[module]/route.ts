import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { enforceParentStudentScope } from "@/lib/phase3-security";
import { listPhase3, mutatePhase3, type Phase3Module } from "@/lib/phase3-service";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { readBoundedJson } from "@/lib/bounded-json";
import { decideFinanceAdjustment, requestFinanceAdjustment } from "@/lib/finance-service";

const bodySchema = z.record(z.string().min(1).max(120), z.unknown());
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BODY_KEYS = 60;
const MAX_STRING_VALUE = 10000;

const financeRequestSchema = z.object({
  action: z.literal("request"),
  studentId: z.string().min(1).max(120),
  invoiceId: z.string().min(1).max(120).optional(),
  termId: z.string().min(1).max(120).optional(),
  kind: z.enum(["waiver", "scholarship", "sibling_discount"]),
  mode: z.enum(["amount", "percent"]),
  value: z.coerce.number().finite().nonnegative(),
  reason: z.string().trim().min(2).max(500),
  siblingGroupKey: z.string().trim().max(120).optional(),
  fundingSource: z.string().trim().max(160).optional(),
  fundingReference: z.string().trim().max(160).optional(),
});
const financeDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  id: z.string().min(1).max(120),
});

const MODULES=new Set<Phase3Module>(["transport","feeding","cbt","library","assets","finance","recruitment","analytics","sync"]);
const FEATURE:Partial<Record<Phase3Module,string>>={transport:"transport",feeding:"feeding",cbt:"cbt",library:"library",assets:"assets",recruitment:"recruitment"};
function parseModule(value:string):Phase3Module{if(!MODULES.has(value as Phase3Module))throw new AppError("Unknown Phase 3 module.",404,"NOT_FOUND");return value as Phase3Module;}
async function parentScopeCheck(schoolId:string,actorId:string,moduleName:Phase3Module,body:Record<string,unknown>){if(moduleName!=="cbt"&&moduleName!=="library")return;let studentId=body.studentId?String(body.studentId):"";if(moduleName==="cbt"&&!studentId&&(body.action==="answer"||body.action==="submit")){const attemptId=typeof body.attemptId==="string"?body.attemptId:"";if(!attemptId)return;await withTenant(schoolId,async(tx)=>{const rows=await tx.$queryRawUnsafe<Array<{studentId:string}>>(`SELECT "studentId" FROM "P3ExamAttempt" WHERE "id"=$1 AND "schoolId"=$2`,attemptId,schoolId);studentId=rows[0]?.studentId??"";});}if(studentId)await withTenant(schoolId,tx=>enforceParentStudentScope(tx,actorId,studentId));}

async function mutateLegacyFinance(schoolId:string,actorId:string,body:Record<string,unknown>){
  if(body.action==="request"){
    const parsed=financeRequestSchema.safeParse(body);
    if(!parsed.success)throw new AppError("Legacy finance requests must include a valid learner, invoice or term context, adjustment type, value and reason.",400,"INVALID_INPUT");
    return withTenant(schoolId,tx=>requestFinanceAdjustment(tx,{schoolId,actorId,...parsed.data}));
  }
  if(body.action==="approve"||body.action==="reject"){
    const parsed=financeDecisionSchema.safeParse(body);
    if(!parsed.success)throw new AppError("A valid adjustment decision is required.",400,"INVALID_INPUT");
    return withTenant(schoolId,tx=>decideFinanceAdjustment(tx,{schoolId,actorId,adjustmentId:parsed.data.id,decision:parsed.data.action}));
  }
  throw new AppError("Unknown finance adjustment action.",400,"UNKNOWN_ACTION");
}

export async function GET(_request:Request,context:{params:Promise<{module:string}>}){try{const session=await requireSchoolSession();const moduleName=parseModule((await context.params).module);const result=await withTenant(session.schoolId,async(tx)=>{const flag=FEATURE[moduleName];if(flag)await requireSchoolFeatureInTransaction(tx,session.schoolId,flag);return listPhase3(tx,session.userId,moduleName);});return NextResponse.json({ok:true,module:moduleName,result});}catch(error){return routeError(error);}}
export async function POST(request:Request,context:{params:Promise<{module:string}>}){try{const session=await requireSchoolSession();const moduleName=parseModule((await context.params).module);const raw=await readBoundedJson(request,MAX_BODY_BYTES,"Phase 3 request");if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new AppError("Request body must be an object.",400,"INVALID_INPUT");const parsed=bodySchema.safeParse(raw);if(!parsed.success)throw new AppError("Request body keys must be short strings.",400,"INVALID_INPUT");const entries=Object.entries(parsed.data);if(entries.length>MAX_BODY_KEYS)throw new AppError(`Request body must contain at most ${MAX_BODY_KEYS} fields.`,413,"BODY_TOO_LARGE");for(const [,value] of entries){if(typeof value==="string"&&value.length>MAX_STRING_VALUE)throw new AppError("A request field exceeds the maximum length.",413,"BODY_TOO_LARGE");}const body=parsed.data as Record<string,unknown>;const flag=FEATURE[moduleName];await withTenant(session.schoolId,async(tx)=>{if(flag)await requireSchoolFeatureInTransaction(tx,session.schoolId,flag);});if(moduleName==="assets")throw new AppError("Legacy asset editing has been retired. Use School Properties for all new property and custody changes.",410,"LEGACY_ASSET_WRITER_RETIRED");if(moduleName==="finance"){const result=await mutateLegacyFinance(session.schoolId,session.userId,body);return NextResponse.json({ok:true,module:moduleName,result});}await parentScopeCheck(session.schoolId,session.userId,moduleName,body);const result=await withTenant(session.schoolId,tx=>mutatePhase3(tx,session.schoolId,session.userId,moduleName,body));return NextResponse.json({ok:true,module:moduleName,result});}catch(error){return routeError(error);}}