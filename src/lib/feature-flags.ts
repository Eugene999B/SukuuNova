import type { TenantDb } from "./db";
import { withTenant } from "./db";
import { AppError } from "./errors";
export const PREMIUM_FEATURE_FLAGS={face:"face_recognition",payroll:"payroll",transport:"transport",feeding:"feeding",cbt:"cbt",library:"library",assets:"assets",recruitment:"recruitment"} as const;
export function featureFlagsContain(flags:unknown,featureFlag:string){return Array.isArray(flags)&&flags.some(v=>v===featureFlag);}
export async function schoolHasFeature(tx:TenantDb,schoolId:string,featureFlag:string){const row=await tx.school.findUnique({where:{id:schoolId},select:{subscriptionPlan:{select:{featureFlags:true,name:true}}}});return{enabled:featureFlagsContain(row?.subscriptionPlan?.featureFlags,featureFlag),planName:row?.subscriptionPlan?.name??null};}
export async function requireSchoolFeature(schoolId:string,featureFlag:string){return withTenant(schoolId,async(tx)=>requireSchoolFeatureInTransaction(tx,schoolId,featureFlag));}
export async function requireSchoolFeatureInTransaction(tx:TenantDb,schoolId:string,featureFlag:string){const result=await schoolHasFeature(tx,schoolId,featureFlag);if(!result.enabled)throw new AppError(`The ${featureFlag.replace(/_/g," ")} module is not included in this school's subscription plan.`,403,"FEATURE_NOT_INCLUDED");return result;}
