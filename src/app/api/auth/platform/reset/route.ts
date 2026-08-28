import { NextResponse } from "next/server";
import { z } from "zod";
import { issuePlatformPasswordReset, confirmPlatformPasswordReset } from "@/lib/password-reset";
import { routeError } from "@/lib/errors";
const schema=z.discriminatedUnion("mode",[
 z.object({mode:z.literal("request"),email:z.string().email()}),
 z.object({mode:z.literal("confirm"),token:z.string().min(20),newPassword:z.string().min(12).max(256)})
]);
export async function POST(request:Request){try{const input=schema.parse(await request.json());if(input.mode==="request"){const delivery=await issuePlatformPasswordReset(input.email);return NextResponse.json({ok:true,message:"If that account is active, a reset token has been issued.",delivery:delivery?{token:delivery.token,expiresAt:delivery.expiresAt}:null});}await confirmPlatformPasswordReset(input);return NextResponse.json({ok:true,message:"Password reset completed."});}catch(e){return routeError(e);}}
