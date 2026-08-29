import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeError, UnauthorizedError, ForbiddenError } from "@/lib/errors";

const schema=z.object({status:z.enum(["new","open","resolved"]),repliedVia:z.string().max(40).optional()});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const session=await getPlatformSession();if(!session)throw new UnauthorizedError();if(!["super_admin","platform_admin","support_admin"].includes(session.role))throw new ForbiddenError();const {id}=await params;const input=schema.parse(await request.json());await db.$executeRawUnsafe(`UPDATE "PublicInquiry" SET "status"=$1,"repliedVia"=$2,"repliedAt"=CASE WHEN $1='resolved' THEN CURRENT_TIMESTAMP ELSE "repliedAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3`,input.status,input.repliedVia||null,id);return NextResponse.json({ok:true});}catch(error){return routeError(error);}}
