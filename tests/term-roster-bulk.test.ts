import { describe,it,expect,vi } from "vitest";
import type { TenantDb } from "../src/lib/db";
import { resolveTermRoster } from "../src/lib/student-term-context";

function fixture(evidence:unknown[],count=1){
  const students=Array.from({length:count},(_,i)=>({id:"s"+i,name:"Learner "+i,admissionNo:"A"+i,classId:"today"}));
  const term=vi.fn().mockResolvedValue({academicYearId:"year"});
  const roster=vi.fn().mockResolvedValue(students);
  const raw=vi.fn().mockResolvedValue(evidence);
  return {tx:{term:{findFirst:term},student:{findMany:roster},$queryRawUnsafe:raw} as unknown as TenantDb,term,roster,raw};
}
const input={schoolId:"school",termId:"term"};
describe("bounded term roster reads",()=>{
  it("resolves 1000 historical enrolments with three queries",async()=>{
    const f=fixture(Array.from({length:1000},(_,i)=>({studentId:"s"+i,classId:"old",source:"enrollment",status:"confirmed"})),1000);
    const rows=await resolveTermRoster(f.tx,input);
    expect(rows).toHaveLength(1000);expect(rows.every(r=>r.termClassId==="old")).toBe(true);
    expect(f.term).toHaveBeenCalledTimes(1);expect(f.roster).toHaveBeenCalledTimes(1);expect(f.raw).toHaveBeenCalledTimes(1);
    expect(f.raw.mock.calls[0].slice(1)).toEqual(["school","term","year"]);
  });
  it("does not treat draft or withdrawn enrolments as operational even with score history",async()=>{
    for(const status of ["draft","withdrawn"]){
      const f=fixture([{studentId:"s0",classId:"old",source:"enrollment",status},{studentId:"s0",classId:"other",source:"score_history",status:null}]);
      expect((await resolveTermRoster(f.tx,input))[0].termClassId).toBeNull();
    }
  });
  it("rejects conflicting legacy classes rather than assigning a guessed class",async()=>{
    const f=fixture(["a","b"].map(classId=>({studentId:"s0",classId,source:"score_history",status:null})));
    await expect(resolveTermRoster(f.tx,input)).rejects.toMatchObject({code:"AMBIGUOUS_SCORE_CLASS_HISTORY"});
  });
  it("uses frozen report evidence before invoice history",async()=>{
    const f=fixture([{studentId:"s0",classId:"report",source:"report_snapshot",status:null},{studentId:"s0",classId:"invoice",source:"invoice_history",status:null}]);
    expect((await resolveTermRoster(f.tx,input))[0].termClassId).toBe("report");
  });
  it("does not infer an official class from the current student projection",async()=>{
    const f=fixture([]);expect((await resolveTermRoster(f.tx,input))[0].termClassId).toBeNull();
    expect((await resolveTermRoster(f.tx,{...input,requireOfficialEnrollment:false}))[0].termClassId).toBe("today");
  });
  it("shares concurrent reads but never caches across later transaction work",async()=>{
    const f=fixture([]);
    await Promise.all([resolveTermRoster(f.tx,input),resolveTermRoster(f.tx,input)]);
    expect(f.raw).toHaveBeenCalledTimes(1);
    await resolveTermRoster(f.tx,input);expect(f.raw).toHaveBeenCalledTimes(2);
  });
  it("treats an explicitly empty student selection as empty",async()=>{
    const f=fixture([]);f.roster.mockResolvedValueOnce([]);
    expect(await resolveTermRoster(f.tx,{...input,studentIds:[]})).toEqual([]);
    expect(f.roster.mock.calls[0][0].where.id).toEqual({in:[]});
  });
});
