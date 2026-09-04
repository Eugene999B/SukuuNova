import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { appendPlatformAudit } from "@/lib/audit";

const schema=z.object({status:z.enum(["new","open","resolved"]),repliedVia:z.string().max(40).optional()});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requirePlatformSession();
    await requirePlatformPermission(session,"support.manage");
    const {id}=await params;
    const input=schema.parse(await request.json());
    const before=(await db.$queryRawUnsafe<Array<{status:string;repliedVia:string|null}>>(`SELECT "status","repliedVia" FROM "PublicInquiry" WHERE "id"=$1 FOR UPDATE`,id))[0];
    if(!before) throw new AppError("Public inquiry not found.",404,"NOT_FOUND");
    await db.$executeRawUnsafe(`UPDATE "PublicInquiry" SET "status"=$1,"repliedVia"=$2,"repliedAt"=CASE WHEN $1='resolved' THEN CURRENT_TIMESTAMP ELSE "repliedAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3`,input.status,input.repliedVia||null,id);
    await appendPlatformAudit({actorId:session.adminId,action:"public_inquiry.updated",targetEntity:`PublicInquiry:${id}`,meta:{before,after:{status:input.status,repliedVia:input.repliedVia||null}}});
    return NextResponse.json({ok:true});
  }catch(error){return routeError(error);}
}
