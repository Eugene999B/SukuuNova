import { describe, expect, it, vi } from "vitest";
import type { TenantDb } from "../src/lib/db";
vi.mock("../src/lib/student-term-context", () => ({ resolveTermRoster: vi.fn(async () => [
  { id: "partial", name: "Partial", termClassId: "c" },
  { id: "complete", name: "Complete", termClassId: "c" },
]), resolveStudentTermClass: vi.fn() }));
import { overallTotalsForScope, promotionForRule, reportRulesFor } from "../src/lib/report-card-ranking";
import { calculateSubjectResult } from "../src/lib/assessment-engine";
const rules = reportRulesFor({gradeCaWeight:30,gradeExamWeight:70,gradingScale:null,assessmentConfig:{missingScorePolicy:"zero"}});
describe("partial reports", () => {
  it("keeps entered marks and real zeroes but leaves missing totals pending", () => {
    const rows = [{id:"ca",name:"CA",type:"ca",maxScore:100,weight:30,score:80},
      {id:"exam",name:"Exam",type:"exam",maxScore:100,weight:70,score:null}];
    const partial = calculateSubjectResult(rows,rules);
    expect(partial.breakdown.ca.contribution).toBe(24);
    expect(partial.total).toBeNull();
    expect(calculateSubjectResult([{...rows[0],score:0},{...rows[1],score:0}],rules).total).toBe(0);
  });
  it("does not rank a high-scoring partial record above a complete record", async () => {
    const assessments = ["math","english"].flatMap(subjectId => ["ca","exam"].map(type => ({
      id:subjectId+type,classId:"c",subjectId,type,maxScore:100,weight:type==="ca"?30:70,
      subject:{id:subjectId,name:subjectId},
      scores:[{studentId:"complete",value:70,status:"present"},
        ...(subjectId==="math"?[{studentId:"partial",value:100,status:"present"}]:[])],
    })));
    const tx={assessment:{findMany:vi.fn(async()=>assessments)},classSubjectTeacher:{findMany:vi.fn(async()=>[
      {classId:"c",subjectId:"math"},{classId:"c",subjectId:"english"},
    ])}} as unknown as TenantDb;
    const result=await overallTotalsForScope(tx,{schoolId:"s",termId:"t",classIds:["c"],rules});
    expect(result.names.size).toBe(2);
    expect([...result.totals]).toEqual([["complete",70]]);
  });
  it("does not treat an unentered subject as an automatic failure or promotion",()=>{
    for(const rule of ["pass_mark","overall_position"] as const)
      expect(promotionForRule(rule,{overallPosition:null,rankedCount:10,cutoffPercent:50,lines:[{total:90},{total:null}],passMark:50})).toBe("decision_required");
  });
});
