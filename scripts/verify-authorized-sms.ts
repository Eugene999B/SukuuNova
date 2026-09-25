import { rawDb } from "../src/lib/db";
import { getSmsProviderReadiness, sendSmsThroughProvider, getArkeselBalanceDetails } from "../src/lib/sms-provider";

// A single explicitly authorised handset check; never send to synthetic contacts.
const KEY="2026-09-25-owner-handset-check";
async function main() {
  if(process.env.RUN_AUTHORIZED_OWNER_SMS_TEST !== KEY) return;
  const directory=await rawDb.schoolLoginDirectory.findUnique({where:{uniqueCode:"eug123"}});
  if(!directory) throw new Error("Demo directory missing.");
  const schoolId=directory.schoolId;
  const readiness=await getSmsProviderReadiness();
  const provider=readiness.providers.find(p=>p.key===readiness.activeProvider);
  if(!provider?.configured) throw new Error("Active SMS provider is not configured.");
  const claim=await rawDb.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)",schoolId);
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))",KEY);
    const school=await tx.school.findFirst({where:{id:schoolId,name:"Eugene Academy"}});
    const owner=await tx.user.findFirst({where:{schoolId,email:"eugeneacademy@gmail.com"}});
    if(!school || !owner) throw new Error("Exact demo identity guard failed.");
    if(await tx.auditLogSchool.findFirst({where:{schoolId,action:"sms.authorized_handset_attempt",entityId:KEY}})) return null;
    await tx.auditLogSchool.create({data:{schoolId,actorId:owner.id,action:"sms.authorized_handset_attempt",entityType:"SmsVerification",entityId:KEY,after:{destinationSuffix:"9261",provider:provider.key,maximumAttempts:1}}});
    return owner.id;
  });
  if(!claim){console.log("[sms-handset-check] attempt already recorded; no duplicate sent.");return;}
  // The committed claim deliberately prevents automatic retries after uncertain delivery.
  let outcome: Record<string, unknown>;
  try {
    const result=await sendSmsThroughProvider(provider.key,{phone:"+233559529261",body:"SukuuNova SMS test: your school messaging connection is being verified. This is the single test you authorised. No reply needed."});
    outcome={status:"provider_accepted",...result};
  } catch(error) { outcome={status:"failed_or_uncertain",error:error instanceof Error?error.message:"Unknown provider failure"}; }
  await rawDb.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)",schoolId);
    await tx.auditLogSchool.create({data:{schoolId,actorId:claim,action:"sms.authorized_handset_result",entityType:"SmsVerification",entityId:KEY,after:JSON.parse(JSON.stringify(outcome))}});
  });
  console.log("[sms-handset-check]",JSON.stringify(outcome));
  if(provider.key==="arkesel") console.log("[sms-balance-check]",JSON.stringify(await getArkeselBalanceDetails()));
}
main().catch(error=>{console.error("[sms-handset-check]",error instanceof Error?error.message:String(error));process.exitCode=1;}).finally(()=>rawDb.$disconnect());
