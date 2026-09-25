import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { reportCardThemeById } from "./report-card-themes";
import type { getReportCardPrintData } from "./report-card-print-data";
import type { SignatureSnapshot } from "./report-card-signatures";

export type ReportPdfData = Awaited<ReturnType<typeof getReportCardPrintData>>;
const color = (hex: string) => rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
const number = (value: number | null | undefined) => value == null ? "Pending" : Number.isInteger(value) ? String(value) : value.toFixed(2);
const clean = (value: unknown) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");

export async function buildReportCardPdf(data: ReportPdfData, signatures: SignatureSnapshot[] = []) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(path.join(process.cwd(),"public/fonts/NotoSans-Regular.ttf")), {subset:true});
  const theme = reportCardThemeById(data.reportSettings.themeId);
  const primary = color(theme.primary), ink = color(theme.ink), accent = color(theme.accent);
  const width=595.28, height=841.89, margin=40, content=width-2*margin;
  let page=pdf.addPage([width,height]), y=height-margin;
  pdf.setTitle(data.student.name+" · "+data.term.academicYear+" · "+data.term.name);
  pdf.setAuthor(data.school.name);
  pdf.setSubject("Term report · "+data.student.admissionNo);
  const text=(value:unknown,x:number,top:number,size=10,tone=ink)=>page.drawText(clean(value),{x,y:top-size,font,size,color:tone});
  const wrap=(value:unknown,size:number,maxWidth:number)=>{
    const lines:string[]=[];
    for(const paragraph of clean(value).split(/\r?\n/)){
      let line="";
      for(const ch of paragraph){
        if(line && font.widthOfTextAtSize(line+ch,size)>maxWidth){lines.push(line);line="";}
        line+=ch;
      }
      lines.push(line);
    }
    return lines;
  };
  const header=(continuation=false)=>{
    page.drawRectangle({x:0,y:height-7,width,height:7,color:primary});
    const schoolLines=wrap(data.school.name,19,content-62);
    schoolLines.forEach((line,i)=>text(line,margin,y-i*25,19,primary));
    y-=schoolLines.length*25+3;
    if(!continuation){
      const address=[data.school.locationText || data.school.physicalAddress,data.school.phonePrimary,data.school.email].filter(Boolean).join(" · ");
      for(const line of wrap(address,8,content)){text(line,margin,y,8);y-=12;}
      if(data.school.motto){for(const line of wrap(data.school.motto,9,content)){text(line,margin,y,9);y-=13;}}
    }
    y-=8;
    text(continuation?"TERM REPORT · CONTINUED":"TERM REPORT",margin,y,11,primary);y-=19;
    for(const line of wrap(data.term.academicYear+" · "+data.term.name,10,content)){text(line,margin,y,10);y-=15;}
    y-=7;
  };
  const ensure=(space:number)=>{
    if(y-space>=58)return;
    page=pdf.addPage([width,height]);y=height-margin;header(true);
    text(data.student.name+" · "+data.student.admissionNo,margin,y,9);y-=22;
  };
  const paragraph=(label:string,value:unknown)=>{
    const lines=wrap(value || "Not recorded",9,content);
    ensure(26);text(label.toUpperCase(),margin,y,8,primary);y-=14;
    for(const line of lines){ensure(14);text(line,margin,y,9);y-=12;}
    y-=6;
  };
  header();
  // Embedded assets only: PDF generation never makes arbitrary remote requests.
  const image=async(value:string|null|undefined,x:number,top:number,w:number,h:number)=>{
    const match=/^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=\s]+)$/i.exec(value??"");
    if(!match || match[2].length>3_400_000)return;
    try{
      const bytes=Buffer.from(match[2],"base64");
      const asset=match[1].toLowerCase()==="png"?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
      const scale=Math.min(w/asset.width,h/asset.height);
      page.drawImage(asset,{x,y:top-asset.height*scale,width:asset.width*scale,height:asset.height*scale});
    }catch{ /* Text identity remains available when an optional image is invalid. */ }
  };
  await image(data.school.logoUrl,width-margin-52,height-margin,48,48);
  const nameLines=wrap(data.student.name,14,content-70);
  ensure(nameLines.length*20+72);
  const identityTop=y;
  for(const line of nameLines){text(line,margin,y,14,primary);y-=20;}
  for(const line of wrap(data.student.className+" · "+(data.school.identifierLabel || "Admission No.")+" "+data.student.admissionNo,10,content-70)){text(line,margin,y,10);y-=15;}
  text(data.status==="approved" || data.status==="sent"?"APPROVED TERM RECORD":"DRAFT · FOR REVIEW",margin,y,8,primary);y-=22;
  if(data.reportSettings.showStudentPhoto)await image(data.student.photoUrl,width-margin-55,identityTop,48,58);
  y=Math.min(y,identityTop-72);
  const showPosition=data.reportSettings.showSubjectPosition;
  const xs=[margin+8,margin+238,margin+300,margin+365,margin+425,margin+468];
  const tableHeader=()=>{
    ensure(50);
    page.drawRectangle({x:margin,y:y-27,width:content,height:27,color:primary});
    const labels=["Subject","CA / "+number(data.gradingWeights.ca),"Exam / "+number(data.gradingWeights.exam),"Total / 100","Grade",...(showPosition?["Pos."]:[])];
    labels.forEach((label,i)=>text(label,xs[i],y-8,8,rgb(1,1,1)));
    y-=27;
  };
  tableHeader();
  for(const [index,row] of data.results.entries()){
    const lines=wrap(row.subject,9,222),rowHeight=Math.max(theme.density==="compact"?21:24,lines.length*13+12);
    if(y-rowHeight<65){ensure(height);tableHeader();}
    if(index%2===0)page.drawRectangle({x:margin,y:y-rowHeight,width:content,height:rowHeight,color:accent});
    lines.forEach((line,i)=>text(line,xs[0],y-7-i*13,9));
    [number(row.ca),number(row.exam),number(row.total),row.grade??"—",...(showPosition?[number(row.position)]:[])].forEach((value,i)=>text(value,xs[i+1],y-7,9));
    y-=rowHeight;
  }
  y-=18;
  paragraph("Summary","Average: "+(data.summary.average == null ? "Pending" : number(data.summary.average)+"%")+"   |   Grade: "+(data.summary.grade??"—")+"   |   Total: "+number(data.summary.total)+(data.reportSettings.showOverallPosition?"   |   Position: "+number(data.position)+" of "+data.classSize:""));
  if(data.reportSettings.showAttendance)paragraph("Attendance","Present: "+data.attendance.present+"   |   Expected school days: "+data.attendance.expectedDays+"   |   Absent: "+data.attendance.absent+"   |   Late: "+data.attendance.late);
  if(data.reportSettings.showClassTeacherRemark)paragraph("Class teacher's remark",data.remarks);
  if(data.reportSettings.showHeadteacherRemark)paragraph("Headteacher's remark",data.headRemark);
  if(data.reportTraits.length)paragraph("Development and conduct",data.reportTraits.map(t=>t.label+": "+t.value).join(" · "));
  if(data.yearEndSession && data.reportSettings.showPromotion){
    const promotion=data.structuredPromotion;
    paragraph("Year-end decision",promotion ? [promotion.outcome.replaceAll("_"," "),promotion.targetGradeName,promotion.targetPathwayName,promotion.reason].filter(Boolean).join(" · ") : data.promotionDecision.replaceAll("_"," "));
  }
  const date=(v:Date|string|null|undefined)=>v?new Intl.DateTimeFormat("en-GH",{dateStyle:"medium",timeZone:"Africa/Accra"}).format(new Date(v)):"Not set";
  paragraph("School calendar","Vacation: "+date(data.calendar.vacationDate)+"   |   Reopening: "+date(data.calendar.reopeningDate));
  if(data.gradingScale.length)paragraph("Grading key",data.gradingScale.map(b=>b.grade+" "+b.min+"–"+b.max+(b.label?" ("+b.label+")":"")).join(" · "));
  for(let offset=0;offset<signatures.length;offset+=3){
    ensure(72);
    const row=signatures.slice(offset,offset+3), column=content/row.length;
    for(const [index,signature] of row.entries()){
      const x=margin+index*column;
      await image(signature.signatureDataUrl,x,y,column-16,30);
      for(const [lineIndex,line] of wrap(signature.name,9,column-16).slice(0,2).entries())text(line,x,y-33-lineIndex*12,9);
      text(signature.role,x,y-58,8);
    }
    y-=76;
  }
  if(data.school.documentFooter)paragraph("School note",data.school.documentFooter);
  const pages=pdf.getPages();
  for(const [index,sheet] of pages.entries()){
    sheet.drawLine({start:{x:margin,y:42},end:{x:width-margin,y:42},thickness:.5,color:primary});
    sheet.drawText("SukuuNova · "+data.reportId+" · "+(index+1)+"/"+pages.length,{x:margin,y:28,size:7,font,color:ink});
  }
  return Buffer.from(await pdf.save());
}
