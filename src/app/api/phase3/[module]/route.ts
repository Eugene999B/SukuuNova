import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { enforceParentStudentScope } from "@/lib/phase3-security";
import { listPhase3, mutatePhase3, type Phase3Module } from "@/lib/phase3-service";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";

// Envelope guard: the module service validates individual actions, but an
// unbounded raw body must never reach it (JSONB columns, audit trails).
const bodySchema = z.record(z.string().min(1).max(120), z.unknown());
const MAX_BODY_KEYS = 60;
const MAX_STRING_VALUE = 10000;

const MODULES=new Set<Phase3Module>(["transport","feeding","cbt","library","assets","finance","recruitment","analytics","sync"]);
const FEATURE:Partial<Record<Phase3Module,string>>={transport:"transport",feeding:"feeding",cbt:"cbt",library:"library",assets:"assets",recruitment:"recruitment"};
function parseModule(value:string):Phase3Module{if(!MODULES.has(value as Phase3Module))throw new AppError("Unknown Phase 3 module.",404,"NOT_FOUND");return value as Phase3Module;}
async function parentScopeCheck(schoolId:string,actorId:string,moduleName:Phase3Module,body:Record<string,unknown>){if(moduleName!=="cbt"&&moduleName!=="library")return;let studentId=body.studentId?String(body.studentId):"";if(moduleName==="cbt"&&!studentId&&(body.action==="answer"||body.action==="submit")){const attemptId=typeof body.attemptId==="string"?body.attemptId:"";if(!attemptId)return;await withTenant(schoolId,async(tx)=>{const rows=await tx.$queryRawUnsafe<Array<{studentId:string}>>(`SELECT "studentId" FROM "P3ExamAttempt" WHERE "id"=$1 AND "schoolId"=$2`,attemptId,schoolId);studentId=rows[0]?.studentId??"";});}if(studentId)await withTenant(schoolId,tx=>enforceParentStudentScope(tx,actorId,studentId));}
export async function GET(_request:Request,context:{params:Promise<{module:string}>}){try{const session=await requireSchoolSession();const moduleName=parseModule((await context.params).module);const result=await withTenant(session.schoolId,async(tx)=>{const flag=FEATURE[moduleName];if(flag)await requireSchoolFeatureInTransaction(tx,session.schoolId,flag);return listPhase3(tx,session.userId,moduleName);});return NextResponse.json({ok:true,module:moduleName,result});}catch(error){return routeError(error);}}
export async function POST(request:Request,context:{params:Promise<{module:string}>}){try{const session=await requireSchoolSession();const moduleName=parseModule((await context.params).module);const raw=await request.json();if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new AppError("Request body must be an object.",400,"INVALID_INPUT");const parsed=bodySchema.safeParse(raw);if(!parsed.success)throw new AppError("Request body keys must be short strings.",400,"INVALID_INPUT");const entries=Object.entries(parsed.data);if(entries.length>MAX_BODY_KEYS)throw new AppError(`Request body must contain at most ${MAX_BODY_KEYS} fields.`,413,"BODY_TOO_LARGE");for(const [,value] of entries){if(typeof value==="string"&&value.length>MAX_STRING_VALUE)throw new AppError("A request field exceeds the maximum length.",413,"BODY_TOO_LARGE");}const body=parsed.data as Record<string,unknown>;const flag=FEATURE[moduleName];await withTenant(session.schoolId,async(tx)=>{if(flag)await requireSchoolFeatureInTransaction(tx,session.schoolId,flag);});await parentScopeCheck(session.schoolId,session.userId,moduleName,body);const result=await withTenant(session.schoolId,tx=>mutatePhase3(tx,session.schoolId,session.userId,moduleName,body));return NextResponse.json({ok:true,module:moduleName,result});}catch(error){return routeError(error);}}