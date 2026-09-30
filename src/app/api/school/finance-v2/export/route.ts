import { financeRegisterRange, loadFinanceRegister } from "@/lib/finance-register";
import { NextResponse } from "next/server";
import { buildReceiptPdf, receiptCsvCell } from "@/lib/receipt-pdf";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppError, routeError } from "@/lib/errors";

type Row={type:string;date:Date;party:string;category:string;method:string;reference:string;status:string;amount:unknown};
const esc=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const csv=receiptCsvCell;
const date=(value:Date)=>value.toISOString().slice(0,10);
const money=(value:unknown)=>Number(value||0).toFixed(2);
async function pdfBytes(schoolName:string,rows:Row[],from:Date|null,to:Date|null){
  return buildReceiptPdf([
    {text:schoolName,size:16},
    {text:"Finance Transaction Register",size:13},
    {text:`Period: ${from?date(from):"Beginning"} to ${to?date(to):"Latest"}`,size:9},
    ...rows.map(row=>({text:`${date(row.date)} | ${row.type} | ${row.party} | ${row.category} | GHS ${money(row.amount)} | ${row.status}\nMethod: ${row.method} | Reference: ${row.reference}`,size:8})),
  ]);
}

export async function GET(request:Request){
  try{
    const session=await requireSchoolSession();
    const url=new URL(request.url);
    const format=(url.searchParams.get("format")||"csv").toLowerCase();
    if(!["csv","xls","doc","pdf","json"].includes(format))return NextResponse.json({error:"Unsupported export format."},{status:400});
    const{from,to}=financeRegisterRange(url);
    const result=await withTenant(session.schoolId,async tx=>{
      await requirePermission(tx,session.userId,"finance:export");
      const school=await tx.school.findUnique({where:{id:session.schoolId},select:{name:true}});
      const rows=await loadFinanceRegister(tx,session.schoolId,from,to);
      if(rows.length>5000)throw new AppError("This register exceeds 5,000 entries. Choose a smaller date range; no partial file has been exported.",413,"EXPORT_TOO_LARGE");
      return{schoolName:school?.name||"School",rows};
    });
    const filename=`finance-${new Date().toISOString().slice(0,10)}`;
    if(format==="json")return new NextResponse(JSON.stringify({school:result.schoolName,from,to,transactions:result.rows},null,2),{headers:{"cache-control":"private, no-store","content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="${filename}.json"`}});
    if(format==="csv"){
      const body=["Date,Type,Party,Category,Method,Reference,Status,Amount (GHS)",...result.rows.map(row=>[date(row.date),row.type,row.party,row.category,row.method,row.reference,row.status,money(row.amount)].map(csv).join(","))].join("\n");
      return new NextResponse(body,{headers:{"cache-control":"private, no-store","content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${filename}.csv"`}});
    }
    if(format==="pdf"){
      const bytes=await pdfBytes(result.schoolName,result.rows,from,to);
      return new NextResponse(Buffer.from(bytes),{headers:{"cache-control":"private, no-store","content-type":"application/pdf","content-disposition":`attachment; filename="${filename}.pdf"`}});
    }
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Finance report</title><style>body{font-family:Arial,sans-serif}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:7px;text-align:left}th{font-weight:bold}</style></head><body><h1>${esc(result.schoolName)}</h1><p>Finance transaction register</p><table><thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Category</th><th>Method</th><th>Reference</th><th>Status</th><th>Amount (GHS)</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td>${date(row.date)}</td><td>${esc(row.type)}</td><td>${esc(row.party)}</td><td>${esc(row.category)}</td><td>${esc(row.method)}</td><td>${esc(row.reference)}</td><td>${esc(row.status)}</td><td>${money(row.amount)}</td></tr>`).join("")}</tbody></table></body></html>`;
    const ext=format==="xls"?"xls":"doc";
    const type=format==="xls"?"application/vnd.ms-excel":"application/msword";
    return new NextResponse(html,{headers:{"cache-control":"private, no-store","content-type":`${type}; charset=utf-8`,"content-disposition":`attachment; filename="${filename}.${ext}"`}});
  }catch(error){return routeError(error);}
}
