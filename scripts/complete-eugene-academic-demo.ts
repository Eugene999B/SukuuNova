import { createHash } from "node:crypto";
import { rawDb, type TenantDb } from "../src/lib/db";
import { resolveTermRoster } from "../src/lib/student-term-context";
import { getReportCardPrintData } from "../src/lib/report-card-print-data";
import { buildReportCardPdf } from "../src/lib/report-card-pdf";
import { signaturesForReport } from "../src/lib/report-card-signatures";
import { PDFDocument } from "pdf-lib";

const REVISION = "2026-09-25-complete-academic-demo-v1";
const id = (...parts: string[]) => "demo-" + createHash("sha256").update(parts.join(":")).digest("hex").slice(0,28);
const number = (value: string) => parseInt(createHash("sha256").update(value).digest("hex").slice(0,8),16);
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

async function main() {
  if (process.env.ALLOW_EUGENE_ACADEMY_ACADEMIC_DEMO !== "EUGENE_ACADEMY_ONLY") throw new Error("Explicit Eugene-only academic demo acknowledgement is required.");
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (environment && environment !== "production") throw new Error("Unexpected Railway environment.");
  const directory = await rawDb.schoolLoginDirectory.findUnique({where:{uniqueCode:"eug123"}});
  if (!directory) throw new Error("Eugene Academy directory missing.");
  const schoolId = directory.schoolId;
  const scoped = <T>(work:(tx:TenantDb)=>Promise<T>) => rawDb.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)",schoolId);
    return work(tx);
  },{timeout:120000,maxWait:15000});
  const preflight = await scoped(async tx => {
    const school = await tx.school.findFirst({where:{id:schoolId,uniqueCode:"eug123",name:"Eugene Academy"}});
    const owner = await tx.user.findFirst({where:{schoolId,email:"eugeneacademy@gmail.com",status:"active"}});
    const settings = await tx.schoolSettings.findUnique({where:{schoolId}});
    if (!school || !owner || !settings) throw new Error("Exact demo identity/owner/settings guard failed.");
    const students = await tx.student.findMany({where:{schoolId,status:"active",admissionNo:{startsWith:"SNT-"}},orderBy:{admissionNo:"asc"}});
    if(students.length < 200 || students.length > 300) throw new Error("Unexpected synthetic fixture population.");
    const years = await tx.academicYear.findMany({where:{schoolId,name:{in:["2025/2026","2026/2027"]}},include:{terms:{orderBy:{startDate:"asc"}}},orderBy:{startDate:"asc"}});
    if(years.length !== 2 || years.some(y=>y.terms.length !== 3)) throw new Error("Expected two intact three-term academic cycles; refusing to guess calendar dates.");
    return {owner,students,years,settings};
  });
  if(object(preflight.settings.reportCardConfig).academicDemoRevision === REVISION) {
    console.log("[academic-demo] already completed; preserving subsequent demonstration edits."); return;
  }
  const now = new Date();
  const summaries: unknown[] = [];
  for(const term of preflight.years.flatMap(y=>y.terms).filter(t=>t.startDate <= now)) {
    const summary = await scoped(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))",schoolId + ":academic-demo");
      const roster = await resolveTermRoster(tx,{schoolId,termId:term.id,studentIds:preflight.students.map(s=>s.id),requireOfficialEnrollment:false});
      const existing = await tx.$queryRawUnsafe<Array<{studentId:string;classId:string;status:string}>>('SELECT "studentId","classId","status" FROM "Enrollment" WHERE "schoolId"=$1 AND "termId"=$2',schoolId,term.id);
      const withdrawn = new Set(existing.filter(e=>e.status==="withdrawn").map(e=>e.studentId));
      const learners = roster.filter(s=>!withdrawn.has(s.id)).map(s=>({...s,termClassId:existing.find(e=>e.studentId===s.id)?.classId ?? s.termClassId ?? s.classId}));
      if(learners.some(s=>!s.termClassId)) throw new Error("Synthetic learner without class context.");
      for(const s of learners) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","startDate","guardianVerified","documentsReady","feeReady","notes","createdBy","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'confirmed\',\'returning\',$7,true,true,true,\'Synthetic demonstration enrolment\',$8,NOW()) ON CONFLICT ("schoolId","studentId","academicYearId","termId") DO UPDATE SET "status"=\'confirmed\',"guardianVerified"=true,"documentsReady"=true,"feeReady"=true,"updatedAt"=NOW() WHERE "Enrollment"."status" IN (\'draft\',\'ready\')',
          id(term.id,s.id,"enrol"),schoolId,s.id,term.academicYearId,term.id,s.termClassId,term.startDate,preflight.owner.id);
      }
      const reports = await tx.reportCard.findMany({where:{schoolId,termId:term.id},select:{studentId:true,status:true}});
      const frozen = new Set(reports.filter(r=>r.status!=="draft").map(r=>r.studentId));
      let insertedScores = 0;
      let checkedClasses = 0;
      for(const classId of [...new Set(learners.map(s=>s.termClassId!))]) {
        const classLearners = learners.filter(s=>s.termClassId===classId && !frozen.has(s.id));
        if(!classLearners.length) continue;
        const assignments = await tx.classSubjectTeacher.findMany({where:{schoolId,classId},include:{subject:true}});
        if(!assignments.length) throw new Error("No subject teaching assignments for demo class " + classId);
        for(const assignment of assignments) {
          for(const type of ["ca","exam"]) {
            const name = type==="ca" ? "Demonstration continuous assessment" : "Demonstration end-of-term examination";
            const hasBucket = await tx.assessment.findFirst({where:{schoolId,termId:term.id,classId,subjectId:assignment.subjectId,...(type==="exam"?{type:{in:["exam","Exam","examination"]}}:{type:{notIn:["exam","Exam","examination"]}})}});
            if(!hasBucket) await tx.assessment.create({data:{schoolId,termId:term.id,classId,subjectId:assignment.subjectId,name,type,weight:type==="ca"?40:60,maxScore:100}});
          }
          const assessments = await tx.assessment.findMany({where:{schoolId,termId:term.id,classId,subjectId:assignment.subjectId}});
          const scoreRows = assessments.flatMap(a=>classLearners.map(s=>({
            schoolId,studentId:s.id,subjectId:assignment.subjectId,assessmentId:a.id,
            value:Math.round(Number(a.maxScore)*(52+number(s.id+term.id+a.id)%45))/100,
            enteredBy:assignment.teacherId,status:"present",remarks:"Synthetic demonstration mark."
          })));
          if(scoreRows.length) insertedScores += (await tx.score.createMany({data:scoreRows,skipDuplicates:true})).count;
        }
        checkedClasses++;
      }
      const blocks = await tx.calendarEvent.findMany({where:{schoolId,affectsAttendance:true,startDate:{lte:term.endDate},endDate:{gte:term.startDate}},select:{startDate:true,endDate:true}});
      const attendance = [];
      for(let d=new Date(term.startDate);d<=term.endDate && d<=now;d.setUTCDate(d.getUTCDate()+1)) {
        if([0,6].includes(d.getUTCDay()) || blocks.some(b=>d>=b.startDate && d<=b.endDate)) continue;
        for(const s of learners.filter(s=>!frozen.has(s.id))) {
          if(number(s.id+d.toISOString().slice(0,10))%29===0) continue;
          const day=new Date(d);day.setUTCHours(0,0,0,0);
          const timestamp=new Date(day);timestamp.setUTCHours(7,45,0,0);
          attendance.push({id:id(term.id,s.id,day.toISOString(),"attendance"),schoolId,studentId:s.id,type:"in",method:"manual",timestamp,attendanceDate:day,isLate:false,recordedBy:preflight.owner.id,periodId:"DAILY"});
        }
      }
      for(let i=0;i<attendance.length;i+=500) await tx.attendanceEvent.createMany({data:attendance.slice(i,i+500),skipDuplicates:true});
      for(const s of learners.filter(s=>!frozen.has(s.id))) {
        const remark = [
          "Participates thoughtfully in class. Continue daily reading and show each step when solving problems.",
          "Shows steady progress and works well with others. Review corrections and practise the topics that need more confidence.",
          "Approaches learning with curiosity. Maintain consistent revision and ask questions whenever a concept is unclear."
        ][number(s.id)%3];
        const report = await tx.reportCard.upsert({where:{studentId_termId:{studentId:s.id,termId:term.id}},
          create:{schoolId,studentId:s.id,termId:term.id,templateId:preflight.settings.reportCardTemplateId ?? "preset-classic-blue",remarks:remark,headRemark:"Keep building on your strengths. A regular study routine and support from home will help you make further progress.",calculationSnapshot:{classId:s.termClassId,demoRevision:REVISION}},
          update:{remarks:remark,headRemark:"Keep building on your strengths. A regular study routine and support from home will help you make further progress.",calculationSnapshot:{classId:s.termClassId,demoRevision:REVISION},pdfData:null}});
        await tx.reportCard.update({where:{id:report.id},data:{generatedPdfUrl:"/api/mvp/report-cards/"+report.id+"/pdf"}});
      }
      return {termId:term.id,term:term.name,learners:learners.length,preservedIssuedReports:frozen.size,insertedScores,checkedClasses};
    });
    summaries.push(summary);
    console.log("[academic-demo] term completed",JSON.stringify(summary));
    // Canonical calculation and actual PDF rendering, once for each populated class.
    const samples = await scoped(async tx => {
      const rows=await tx.reportCard.findMany({where:{schoolId,termId:term.id,status:"draft",student:{admissionNo:{startsWith:"SNT-"}}},select:{id:true,calculationSnapshot:true}});
      const seen=new Set<string>(); return rows.filter(r=>{const c=String(object(r.calculationSnapshot).classId);if(seen.has(c))return false;seen.add(c);return true;});
    });
    for(const sample of samples) {
      const document = await scoped(async tx=>({data:await getReportCardPrintData(tx,{schoolId,reportId:sample.id}),signatures:await signaturesForReport(tx,{schoolId,reportId:sample.id})}));
      if(!document.data.results.length || document.data.results.some(r=>r.total==null) || document.data.summary.average==null) throw new Error("Demo report still has incomplete results: "+sample.id);
      const pdf=await PDFDocument.load(await buildReportCardPdf(document.data,document.signatures));
      if(pdf.getPageCount()<1) throw new Error("Empty demonstration PDF.");
    }
  }
  await scoped(async tx=>{
    const settings=await tx.schoolSettings.findUniqueOrThrow({where:{schoolId}});
    await tx.schoolSettings.update({where:{schoolId},data:{reportCardConfig:JSON.parse(JSON.stringify({...object(settings.reportCardConfig),academicDemoRevision:REVISION,academicDemoSummary:summaries}))}});
    await tx.auditLogSchool.create({data:{schoolId,actorId:preflight.owner.id,action:"demo.academic_cycle_completed",entityType:"School",entityId:schoolId,after:JSON.parse(JSON.stringify({revision:REVISION,synthetic:true,summaries}))}});
  });
  console.log("[academic-demo] VERIFIED",JSON.stringify({revision:REVISION,terms:summaries.length,externalMessagesSent:0}));
}
main().catch(error=>{console.error("[academic-demo] failed:",error instanceof Error?error.message:String(error));process.exitCode=1;}).finally(()=>rawDb.$disconnect());
