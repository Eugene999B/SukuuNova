import {describe,it,expect} from "vitest";
import {PDFDocument} from "pdf-lib";
import {buildReportCardPdf,type ReportPdfData} from "../src/lib/report-card-pdf";
import {REPORT_CARD_THEMES} from "../src/lib/report-card-themes";
function sample(themeId:string,subjects=6):ReportPdfData {
  return {
    reportId:"report-test",status:"approved",
    school:{name:"Eugene Academy · Demonstration",uniqueCode:"Eug123",logoUrl:null,brandColors:null,identifierLabel:"Admission No.",country:"Ghana"},
    student:{id:"s",name:"Akɔsua Ɛsi",admissionNo:"EA-001",photoUrl:null,classId:"c",className:"JHS 2",level:"JHS"},
    term:{id:"term",name:"Term 2",academicYearId:"year",academicYear:"2025/26",startDate:new Date("2026-01-01"),endDate:new Date("2026-04-01")},
    gradingWeights:{ca:30,exam:70},gradingScale:[{min:0,max:100,grade:"A",label:"Sample"}],
    results:Array.from({length:subjects},(_,i)=>({subjectId:"subject"+i,subject:"Subject "+i,ca:24,exam:56,total:80,grade:"A",position:1})),
    summary:{total:subjects*80,average:80,grade:"A"},position:1,classSize:30,classRoll:30,rankedCount:30,
    remarks:"Consistent effort.",headRemark:"Keep learning.",attendance:{present:50,late:0,expectedDays:50,absent:0,attendanceRate:100,totalRecorded:50},
    promotionDecision:"decision_required",manualPromotionDecision:null,structuredPromotion:null,yearEndSession:false,calendar:{vacationDate:new Date("2026-04-01"),reopeningDate:null},reportTraits:[],reportingPolicy:null,
    reportSettings:{themeId,showOverallPosition:true,showSubjectPosition:true,showAttendance:true,showPromotion:false,showStudentPhoto:true,showClassTeacherRemark:true,showHeadteacherRemark:true,positionScope:"class"},
    watermark:"",classTeacherName:"Teacher",
  } as unknown as ReportPdfData;
}
describe("repeatable official report PDF",()=>{
  it("renders every available school theme with Unicode learner names",async()=>{
    for(const theme of REPORT_CARD_THEMES){
      const pdf=await PDFDocument.load(await buildReportCardPdf(sample(theme.id)));
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      expect(pdf.getTitle()).toContain("Akɔsua Ɛsi");
    }
  },30000);
  it("paginates large subject lists and long remarks without rejecting the download",async()=>{
    const data=sample(REPORT_CARD_THEMES[0].id,55);
    data.remarks="Meaningful feedback for the learner. ".repeat(70);
    for(let attempt=0;attempt<2;attempt++){
      const pdf=await PDFDocument.load(await buildReportCardPdf(data));
      expect(pdf.getPageCount()).toBeGreaterThan(2);
      expect(pdf.getTitle()).toContain("Term 2");
    }
  });
});

it("keeps a standard eight-subject report with two signatories on one A4 sheet",async()=>{
 const data=sample(REPORT_CARD_THEMES[0].id,8);
 data.school.motto="Learning with purpose";
 data.school.physicalAddress="Accra, Ghana";
 const pdf=await PDFDocument.load(await buildReportCardPdf(data,[
   {userId:"teacher",name:"Class Teacher",role:"Class teacher"},
   {userId:"head",name:"Headteacher",role:"Headteacher"},
 ]));
 expect(pdf.getPageCount()).toBe(1);
});
