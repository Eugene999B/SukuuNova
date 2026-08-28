import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { parentAssistant } from "@/lib/phase4-service";

const schema=z.object({schoolId:z.string(),phone:z.string().min(7).max(40),message:z.string().min(1).max(1000),secret:z.string().min(8).max(200)});
export async function POST(request:Request){try{const input=await parseJson(request,schema);return NextResponse.json(await parentAssistant(input));}catch(error){return routeError(error);}}
