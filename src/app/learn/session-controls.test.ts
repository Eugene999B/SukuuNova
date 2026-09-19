import {describe,it,expect} from "vitest";
import {hasLearningAnswer,sessionSize} from "./session-controls";
describe("learning session controls",()=>{
 it("accepts zero and false without treating blank answers as submissions",()=>{
 expect(hasLearningAnswer("numeric","0")).toBe(true);expect(hasLearningAnswer("boolean",false)).toBe(true);
 for(const kind of ["single","multi","numeric","fill","short","boolean"] as const)expect(hasLearningAnswer(kind,"")).toBe(false);
 expect(hasLearningAnswer("multi",[])).toBe(false);expect(hasLearningAnswer("numeric","Infinity")).toBe(false);expect(hasLearningAnswer("numeric","abc")).toBe(false);
 });
 it("bounds custom question counts",()=>{expect(sessionSize(0)).toBe(1);expect(sessionSize(1000)).toBe(100);expect(sessionSize(7.9)).toBe(7);expect(sessionSize(NaN)).toBe(10);});
});
