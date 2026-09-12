import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { routeError } from "@/lib/errors";

type Row={type:string;date:Date;party:string;category:string;method:string;reference:string;status:string;amount:unknown};
type RawRow=Omit<Row,"date">&{date:Date|string};
const esc=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
const date=(value:Date)=>value.toISOString().slice(0,10);
const money=(value:unknown)=>Number(value||0).toFixed(2);
function range(url:URL){
  const fromValue=url.searchParams.get("from")||null;
  const toValue=url.searchParams.get("to")||null;
  return{
    from:fromValue?new Date(`${fromValue}T00:00:00.000Z`):null,
    to:toValue?new Date(`${toValue}T23:59:59.999Z`):null,
  };
}
async function pdfBytes(schoolName:string,rows:Row[],from:Date|null,to:Date|null){
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page=pdf.addPage([595,842]);
  let y=800;
  const line=(text:string,size=9,isBold=false)=>{
    if(y<55){page=pdf.addPage([595,842]);y=800;}
    page.drawText(text.slice(0,105),{x:42,y,size,font:isBold?bold:font});
    y-=size+6;
  };
  line(schoolName,16,true);
  line("Finance Transaction Register",13,true);
  line(`Period: ${from?date(from):"Beginning"} to ${to?date(to):"Latest"}`,9);
  y-=8;
  for(const row of rows)line(`${date(row.date)} | ${row.type} | ${row.party} | ${row.category} | GHS ${money(row.amount)} | ${row.status}`,8);
  return pdf.save();
}

export async function GET(request:Request){
  try{
    const session=await requireSchoolSession();
    const url=new URL(request.url);
    const format=(url.searchParams.get("format")||"csv").toLowerCase();
    if(!["csv","xls","doc","pdf","json"].includes(format))return NextResponse.json({error:"Unsupported export format."},{status:400});
    const{from,to}=range(url);
    const result=await withTenant(session.schoolId,async tx=>{
      await requirePermission(tx,session.userId,"finance:export");
      const school=await tx.school.findUnique({where:{id:session.schoolId},select:{name:true}});
      const payments=await tx.$queryRawUnsafe<RawRow[]>(
        `WITH payment_categories AS (
           SELECT a."schoolId",a."paymentId",string_agg(DISTINCT fc."name",', ') AS category
             FROM "FinancePaymentAllocation" a
             JOIN "FinanceStudentCharge" ch ON ch."id"=a."chargeId" AND ch."schoolId"=a."schoolId"
             JOIN "FinanceFeeCategory" fc ON fc."id"=ch."categoryId" AND fc."schoolId"=ch."schoolId"
            WHERE a."schoolId"=$1
            GROUP BY a."schoolId",a."paymentId"
         ), reversal_totals AS (
           SELECT "schoolId","paymentId",SUM("amount") AS reversed
             FROM "PaymentReversal"
            WHERE "schoolId"=$1
            GROUP BY "schoolId","paymentId"
         )
         SELECT 'Payment' AS type,p."createdAt" AS date,s."name" AS party,COALESCE(pc.category,'Fees') AS category,p."method" AS method,COALESCE(p."reference",p."id") AS reference,
                CASE WHEN COALESCE(rt.reversed,0)>=p."amount" THEN 'reversed' WHEN COALESCE(rt.reversed,0)>0 THEN 'partially reversed' ELSE 'posted' END AS status,
                GREATEST(0,p."amount"-COALESCE(rt.reversed,0)) AS amount
           FROM "Payment" p
           JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId"
           JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId"
           LEFT JOIN payment_categories pc ON pc."paymentId"=p."id" AND pc."schoolId"=p."schoolId"
           LEFT JOIN reversal_totals rt ON rt."paymentId"=p."id" AND rt."schoolId"=p."schoolId"
          WHERE p."schoolId"=$1 AND ($2::timestamp IS NULL OR p."createdAt">=$2) AND ($3::timestamp IS NULL OR p."createdAt"<=$3)
          ORDER BY p."createdAt"`,
        session.schoolId,from,to,
      );
      const expenses=await tx.$queryRawUnsafe<RawRow[]>(
        `SELECT 'Expense' AS type,e."expenseDate"::timestamp AS date,e."vendor" AS party,e."category",e."paymentMethod" AS method,COALESCE(e."reference",e."id") AS reference,e."status",CASE WHEN e."status"='reversed' THEN 0 ELSE -e."amount" END AS amount FROM "FinanceExpense" e WHERE e."schoolId"=$1 AND ($2::date IS NULL OR e."expenseDate">=$2::date) AND ($3::date IS NULL OR e."expenseDate"<=$3::date) ORDER BY e."expenseDate"`,
        session.schoolId,from,to,
      );
      const rows=[...payments,...expenses]
        .map(row=>({...row,date:new Date(row.date)}))
        .sort((a,b)=>a.date.getTime()-b.date.getTime()) as Row[];
      return{schoolName:school?.name||"School",rows};
    });
    const filename=`finance-${new Date().toISOString().slice(0,10)}`;
    if(format==="json")return new NextResponse(JSON.stringify({school:result.schoolName,from,to,transactions:result.rows},null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="${filename}.json"`}});
    if(format==="csv"){
      const body=["Date,Type,Party,Category,Method,Reference,Status,Amount (GHS)",...result.rows.map(row=>[date(row.date),row.type,row.party,row.category,row.method,row.reference,row.status,money(row.amount)].map(csv).join(","))].join("\n");
      return new NextResponse(body,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${filename}.csv"`}});
    }
    if(format==="pdf"){
      const bytes=await pdfBytes(result.schoolName,result.rows,from,to);
      return new NextResponse(Buffer.from(bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}.pdf"`}});
    }
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Finance report</title><style>body{font-family:Arial,sans-serif}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:7px;text-align:left}th{font-weight:bold}</style></head><body><h1>${esc(result.schoolName)}</h1><p>Finance transaction register</p><table><thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Category</th><th>Method</th><th>Reference</th><th>Status</th><th>Amount (GHS)</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td>${date(row.date)}</td><td>${esc(row.type)}</td><td>${esc(row.party)}</td><td>${esc(row.category)}</td><td>${esc(row.method)}</td><td>${esc(row.reference)}</td><td>${esc(row.status)}</td><td>${money(row.amount)}</td></tr>`).join("")}</tbody></table></body></html>`;
    const ext=format==="xls"?"xls":"doc";
    const type=format==="xls"?"application/vnd.ms-excel":"application/msword";
    return new NextResponse(html,{headers:{"content-type":`${type}; charset=utf-8`,"content-disposition":`attachment; filename="${filename}.${ext}"`}});
  }catch(error){return routeError(error);}
}
