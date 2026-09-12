import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { routeError } from "@/lib/errors";

type PayrollRun={id:string;period:string;status:string};
type PayslipRow={staffName:string;gross:unknown;earningsTotal:unknown;deductionsTotal:unknown;taxTotal:unknown;employerContributionTotal:unknown;net:unknown;status:string;paidAt:Date|string|null;paymentReference:string|null};
const esc=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
const money=(value:unknown)=>Number(value||0).toFixed(2);
async function makePdf(school:string,period:string,rows:PayslipRow[]){
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page=pdf.addPage([595,842]);
  let y=800;
  const line=(text:string,size=9,isBold=false)=>{
    if(y<55){page=pdf.addPage([595,842]);y=800;}
    page.drawText(text.slice(0,110),{x:40,y,size,font:isBold?bold:font});
    y-=size+6;
  };
  line(school,16,true);
  line(`Payroll register - ${period}`,13,true);
  y-=8;
  for(const row of rows)line(`${row.staffName} | earnings GHS ${money(row.earningsTotal??row.gross)} | deductions GHS ${money(row.deductionsTotal)} | net GHS ${money(row.net)} | ${row.status}`,8);
  return pdf.save();
}

export async function GET(request:Request){
  try{
    const session=await requireSchoolSession();
    const url=new URL(request.url);
    const runId=url.searchParams.get("runId")||"";
    const format=(url.searchParams.get("format")||"csv").toLowerCase();
    if(!runId||!["csv","xls","doc","pdf","json"].includes(format))return NextResponse.json({error:"Payroll run and supported format are required."},{status:400});
    const data=await withTenant(session.schoolId,async tx=>{
      await requirePermission(tx,session.userId,"payroll:view_all");
      const school=await tx.school.findUnique({where:{id:session.schoolId},select:{name:true}});
      const runs=await tx.$queryRawUnsafe<PayrollRun[]>(`SELECT "id","period","status" FROM "PayrollRun" WHERE "schoolId"=$1 AND "id"=$2`,session.schoolId,runId);
      if(!runs[0])throw new Error("Payroll run not found.");
      const rows=await tx.$queryRawUnsafe<PayslipRow[]>(`SELECT ps."gross",ps."earningsTotal",ps."deductionsTotal",ps."taxTotal",ps."employerContributionTotal",ps."net",ps."status",ps."paidAt",ps."paymentReference",u."name" AS "staffName" FROM "Payslip" ps JOIN "User" u ON u."id"=ps."staffId" AND u."schoolId"=ps."schoolId" WHERE ps."schoolId"=$1 AND ps."payrollRunId"=$2 ORDER BY u."name"`,session.schoolId,runId);
      return{school:school?.name||"School",run:runs[0],rows};
    });
    const filename=`payroll-${data.run.period}`;
    if(format==="json")return new NextResponse(JSON.stringify({school:data.school,run:data.run,payslips:data.rows},null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="${filename}.json"`}});
    if(format==="csv"){
      const text=["Staff,Earnings,Deductions,Tax,Employer Contribution,Net,Status,Paid At,Payment Reference",...data.rows.map(row=>[row.staffName,money(row.earningsTotal??row.gross),money(row.deductionsTotal),money(row.taxTotal),money(row.employerContributionTotal),money(row.net),row.status,row.paidAt?new Date(row.paidAt).toISOString():"",row.paymentReference||""].map(csv).join(","))].join("\n");
      return new NextResponse(text,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${filename}.csv"`}});
    }
    if(format==="pdf"){
      const bytes=await makePdf(data.school,data.run.period,data.rows);
      return new NextResponse(Buffer.from(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}.pdf"`}});
    }
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Payroll ${esc(data.run.period)}</title></head><body><h1>${esc(data.school)}</h1><h2>Payroll register - ${esc(data.run.period)}</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Staff</th><th>Earnings</th><th>Deductions</th><th>Tax</th><th>Employer contribution</th><th>Net</th><th>Status</th><th>Paid</th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>${esc(row.staffName)}</td><td>${money(row.earningsTotal??row.gross)}</td><td>${money(row.deductionsTotal)}</td><td>${money(row.taxTotal)}</td><td>${money(row.employerContributionTotal)}</td><td>${money(row.net)}</td><td>${esc(row.status)}</td><td>${row.paidAt?esc(new Date(row.paidAt).toLocaleDateString("en-GH")):""}</td></tr>`).join("")}</tbody></table></body></html>`;
    const ext=format==="xls"?"xls":"doc";
    const type=format==="xls"?"application/vnd.ms-excel":"application/msword";
    return new NextResponse(html,{headers:{"content-type":`${type}; charset=utf-8`,"content-disposition":`attachment; filename="${filename}.${ext}"`}});
  }catch(error){return routeError(error);}
}
