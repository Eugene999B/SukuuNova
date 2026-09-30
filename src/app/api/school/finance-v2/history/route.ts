import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError, routeError } from "@/lib/errors";
import { financeRegisterRange, loadFinanceRegister } from "@/lib/finance-register";
export async function GET(request:Request){
 try {
  const session=await requireSchoolSession();
  const url=new URL(request.url);
  const {from,to}=financeRegisterRange(url);
  const page=Number(url.searchParams.get("page")||1);
  if(!Number.isInteger(page)||page<1||page>10000)throw new AppError("Invalid history page.",400,"INVALID_PAGE");
  const rows=await withTenant(session.schoolId,async tx=>{
   await requirePermission(tx,session.userId,"finance:read");
   return loadFinanceRegister(tx,session.schoolId,from,to,51,(page-1)*50);
  });
  return NextResponse.json({rows:rows.slice(0,50),hasMore:rows.length>50,page},{headers:{"cache-control":"private, no-store"}});
 }catch(error){return routeError(error);}
}
