import {describe,it,expect} from "vitest";
import {gradeRecall,normalizeCards,rememberQuestion} from "./review-model";
import type {LearnQuestion} from "../learn-domain";
const q:LearnQuestion={id:"q",exposureKey:"concept:1",kind:"single",subject:"Maths",topic:"Fractions",skill:"Compare",difficulty:2,prompt:"Which is one half?",options:[{id:"a",label:"2/4"},{id:"b",label:"1/4"}],answer:"a",explanation:"Two equal parts out of four make one half."};
describe("Remember scheduling",()=>{
 it("saves answer labels and prioritizes mistakes",()=>{const [c]=rememberQuestion([],q,false,1000);expect(c.answer).toBe("2/4");expect(c.due).toBe(1000);});
 it("does not duplicate cards or delay a due review after another correct practice",()=>{const cards=rememberQuestion([],q,false,1000);const next=rememberQuestion(cards,q,true,2000);expect(next).toHaveLength(1);expect(next[0].due).toBe(1000);});
 it("spaces successful retrieval and schedules a short retry",()=>{const [c]=rememberQuestion([],q,false,1000);expect(gradeRecall(c,"again",2000).due).toBe(602000);expect(gradeRecall(c,"easy",2000).due).toBe(172802000);});
 it("does not turn a diagram question into an incomplete text card",()=>{expect(rememberQuestion([],{...q,stimulus:{kind:"diagram",diagram:"triangle",ariaLabel:"Triangle"}},false)).toEqual([]);});
 it("rejects malformed storage",()=>{expect(normalizeCards([null,{}, {due:"now"}])).toEqual([]);});
});
