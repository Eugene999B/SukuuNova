import { describe, expect, it } from "vitest";
import { catalogFor, isCorrectAnswer, formattedLearningAnswer, type SessionConfig } from "./learn-domain";
import { buildPrimaryMathQuestions, primaryMathCapacityForSelection } from "./primary-math-foundry";
import { buildLearningSession } from "./learning-engine";
import { buildNursingQuestions } from "./nursing-foundry";
import { learningCapabilityForSelection } from "./learning-capabilities";
const cfg=(levelId:string,topicId="all"):SessionConfig=>({lane:"school",programId:"ghana",levelId,subjectId:"mathematics",topicId,mode:"random",count:100,seed:731});
function value(q:ReturnType<typeof buildPrimaryMathQuestions>[number]) {return Number(formattedLearningAnswer(q).replaceAll(",",""));}
describe("primary question quality",()=>{
 it("keeps lower-primary sessions inside their own age-specific task pool",()=>{
  for(const levelId of ["basic-1","basic-2","basic-3"]){
   const questions=buildLearningSession(cfg(levelId));
   expect(questions.length).toBeGreaterThan(10);
   expect(questions.every(q=>q.exposureKey.startsWith("primary-math:"))).toBe(true);
   expect(questions.every(q=>q.difficulty<=2)).toBe(true);
   for(const q of questions) expect(q.prompt).not.toMatch(/percentage|%|area|perimeter|angle|nth term|numerator.*larger|range|mode of/i);
   expect(new Set(questions.map(q=>q.kind)).size).toBeGreaterThan(1);
   expect(questions.some(q=>q.stimulus?.kind==="table")).toBe(true);
  }
 });
 it("keeps operation operands and answers within each class range",()=>{
  for(const [level,limit] of [["basic-1",100],["basic-2",1000],["basic-3",10000]] as const){
   for(let seed=0;seed<8;seed++){
    const questions=buildPrimaryMathQuestions(cfg(level,"operations"),60,seed);
    expect(questions.length).toBeGreaterThan(10);
    for(const q of questions){
     expect(value(q)).toBeGreaterThanOrEqual(0);expect(value(q)).toBeLessThanOrEqual(limit);
     const numbers=q.prompt.match(/\d+/g)!.map(Number);
     expect(numbers.every(n=>n<=limit)).toBe(true);
     if(q.generationFamily?.endsWith(":addition"))expect(value(q)).toBe(numbers[0]+numbers[1]);
     else if(q.generationFamily?.endsWith(":subtraction"))expect(value(q)).toBe(numbers[0]-numbers[1]);
     else expect(value(q)).toBe(numbers[1]-numbers[0]);
    }
   }
  }
 });
 it("does not disguise repeated tasks behind new seeds or choice orders",()=>{
  const identities=new Map<string,string>();let repeats=0;
  for(let seed=0;seed<25;seed++){
   for(const q of buildPrimaryMathQuestions(cfg("basic-1","geometry"),40,seed)){
    const key=q.prompt+"|"+formattedLearningAnswer(q);
    if(identities.has(key)){expect(q.exposureKey).toBe(identities.get(key));repeats++;}
    identities.set(key,q.exposureKey);
   }
  }
  expect(repeats).toBeGreaterThan(20);
 });
 it("provides unique nonnegative choices and gradeable answers across the six classes",()=>{
  for(let year=1;year<=6;year++){
   const level=catalogFor("school").programs.find(p=>p.id==="ghana")!.levels.find(l=>l.id==="basic-"+year)!;
   for(const topic of level.subjects.find(s=>s.id==="mathematics")!.topics){
    for(const q of buildPrimaryMathQuestions(cfg(level.id,topic.id),40,year*127)){
     expect(isCorrectAnswer(q,q.answer)).toBe(true);
     if(q.options){expect(q.options).toHaveLength(4);expect(new Set(q.options.map(o=>o.label)).size).toBe(4);expect(q.options.every(o=>Number(o.label.replaceAll(",",""))>=0)).toBe(true);}
    }
   }
  }
 });
 it("has exactly one mode in generated mode questions",()=>{
  let checked=0;
  for(let seed=0;seed<15;seed++){
   for(const q of buildPrimaryMathQuestions(cfg("basic-6","data-chance"),80,seed)){
    if(!q.generationFamily?.endsWith(":mode"))continue;
    const numbers=q.prompt.match(/\d+/g)!.map(Number);
    const counts=new Map<number,number>();numbers.forEach(n=>counts.set(n,(counts.get(n)??0)+1));
    const max=Math.max(...counts.values());const modes=[...counts].filter(([,count])=>count===max).map(([n])=>n);
    expect(modes).toEqual([value(q)]);checked++;
   }
  }
  expect(checked).toBeGreaterThan(10);
 });
 it("does not include percentages in the Basic 4 fractions and decimals topic",()=>{
  const questions=buildPrimaryMathQuestions(cfg("basic-4","fractions-decimals"),100,51);
  expect(questions.length).toBeGreaterThan(20);
  expect(questions.some(q=>/%|percent/.test(q.prompt))).toBe(false);
 });
 it("reports task families instead of an invented eighty-million question supply",()=>{
  const config=cfg("basic-1","operations");
  expect(primaryMathCapacityForSelection(config)).toBe(3);
  const capability=learningCapabilityForSelection(config);
  expect(capability.stage).toBe("starter");
  expect(capability.estimatedStandardSupply).toBe(3);
  expect(capability.coverageCapacity).toBe(0);
 });
 it("does not raise nursing recall difficulty merely because the same course is in a later year",()=>{
  const config:SessionConfig={lane:"university",programId:"nursing-diploma",levelId:"level-100",subjectId:"therapeutic-communication",topicId:"all",mode:"random",count:100};
  const questions=buildNursingQuestions(config,100,42);
  expect(questions.filter(q=>q.challenge==="Recall").length).toBeGreaterThan(0);
  expect(questions.filter(q=>q.challenge==="Recall").every(q=>q.difficulty===1)).toBe(true);
 });
});
