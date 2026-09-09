import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { appendPlatformAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { getSmsProviderReadiness, type SmsProviderKey } from "@/lib/sms-provider";

const schema=z.object({provider:z.enum(["arkesel","sailup","hubtel","generic"])});
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "billing.view");
    const sms=await getSmsProviderReadiness();
    const whatsapp = {
      configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
      accountConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID),
      authConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN),
      senderConfigured: Boolean(process.env.TWILIO_WHATSAPP_FROM),
    };
    return NextResponse.json({ checkedAt: new Date().toISOString(), sms, whatsapp },{headers:{"cache-control":"no-store"}});
  } catch (error) { return routeError(error); }
}

export async function POST(request:Request){
  try{
    const session=await requirePlatformSession();
    await requirePlatformPermission(session,"billing.manage");
    if(session.role!=="super_admin")throw new AppError("Only Super Admin can switch the platform SMS provider.",403,"FORBIDDEN");
    const input=schema.parse(await request.json());
    const readiness=await getSmsProviderReadiness();
    const target=readiness.providers.find(item=>item.key===input.provider);
    if(!target?.configured)throw new AppError(`${target?.label??input.provider} credentials are not configured on the server.`,409,"SMS_PROVIDER_NOT_CONFIGURED");
    await db.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<Array<{value:unknown}>>(`SELECT "value" FROM "PlatformConfiguration" WHERE "key"='platform.messaging' FOR UPDATE`);
      const current=record(rows[0]?.value);
      const next={...current,smsProvider:input.provider as SmsProviderKey};
      await tx.$executeRawUnsafe(`INSERT INTO "PlatformConfiguration" ("key","value","updatedAt") VALUES ('platform.messaging',$1::jsonb,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=CURRENT_TIMESTAMP`,JSON.stringify(next));
      await appendPlatformAudit({actorId:session.adminId,action:"messaging.sms_provider.switched",targetEntity:"PlatformConfiguration:platform.messaging",meta:{from:readiness.activeProvider,to:input.provider}},tx);
    });
    return NextResponse.json({ok:true,...await getSmsProviderReadiness()},{headers:{"cache-control":"no-store"}});
  }catch(error){return routeError(error);}
}
