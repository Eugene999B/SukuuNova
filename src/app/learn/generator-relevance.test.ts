import { describe, expect, it } from "vitest";
import { catalogFor, formattedLearningAnswer, type SessionConfig } from "./learn-domain";
import { buildIntelligentQuestions, intelligentCapacityForSelection, intelligentTemplatesForSelection } from "./intelligent-foundry";
const law:SessionConfig={lane:"university",programId:"law",levelId:"level-100",subjectId:"all",topicId:"all",mode:"random",count:100,seed:23};
describe("generator curriculum boundaries and genuine task identity",()=>{
 it("binds all-subject generation to courses in the selected programme and year",()=>{
  for(const programId of ["law","computer-science","medicine","business"]){
   const config={...law,programId};
   const level=catalogFor("university").programs.find(p=>p.id===programId)!.levels.find(l=>l.id===config.levelId)!;
   const labels=new Set(level.subjects.map(s=>s.contentLabel??s.label));
   const questions=buildIntelligentQuestions(config,60,87);
   expect(questions.length).toBeGreaterThan(0);
   expect(questions.every(q=>labels.has(q.subject))).toBe(true);
  }
  const questions=buildIntelligentQuestions(law,100,23);
  expect(questions.every(q=>q.generationFamily==="contract-reasoning")).toBe(true);
  expect(questions.every(q=>q.subject==="Law of Contract I")).toBe(true);
 });
 it("does not invent all-subject generators for a nonexistent programme",()=>{
  expect(buildIntelligentQuestions({...law,programId:"not-a-programme"},50)).toEqual([]);
  expect(intelligentCapacityForSelection({...law,programId:"not-a-programme"})).toBe(0);
 });
 it("does not offer secondary computing templates to primary pupils",()=>{
  const config:SessionConfig={...law,lane:"school",programId:"ghana",levelId:"basic-6",subjectId:"computing"};
  expect(buildIntelligentQuestions(config,50)).toEqual([]);
  expect(intelligentCapacityForSelection(config)).toBe(0);
 });
 it("recognises four contract scenarios across cosmetic variations without increasing difficulty",()=>{
  const all=Array.from({length:12},(_,seed)=>buildIntelligentQuestions(law,100,seed)).flat();
  expect(new Set(all.map(q=>q.exposureKey)).size).toBe(4);
  expect(intelligentCapacityForSelection(law)).toBe(4);
  expect(all.every(q=>q.challenge==="Apply"&&q.difficulty===2)).toBe(true);
  const byAnswer=new Map<string,string>();
  for(const q of all){
   const answer=formattedLearningAnswer(q);
   if(byAnswer.has(answer))expect(q.exposureKey).toBe(byAnswer.get(answer));
   byAnswer.set(answer,q.exposureKey);
  }
 });
 it("connects the current JHS equation and probability topics to matching generators",()=>{
  for(const [topicId,id] of [["variables-equations","jhs-algebra"],["probability","jhs-statistics"]]){
   const config:SessionConfig={...law,lane:"school",programId:"ghana",levelId:"jhs-2",subjectId:"mathematics",topicId};
   expect(intelligentTemplatesForSelection(config).map(t=>t.id)).toEqual([id]);
   expect(buildIntelligentQuestions(config,12,91)).toHaveLength(12);
  }
 });
 it("makes loop-iteration questions require reasoning rather than copying a stated count",()=>{
  const config:SessionConfig={...law,programId:"computer-science",subjectId:"programming"};
  const questions=buildIntelligentQuestions(config,100,77).filter(q=>q.skill==="Reason about loop execution");
  expect(questions.length).toBeGreaterThan(0);
  for(const q of questions){
   expect(q.prompt).not.toMatch(/exactly \d+ times/);
   const numbers=q.prompt.match(/-?\d+/g)!.map(Number);
   expect(Number(formattedLearningAnswer(q))).toBe((numbers[2]-numbers[0])/numbers[1]);
   expect(q.difficulty).toBe(2);
  }
 });
 it("does not multiply five management scenarios into thousands of unique questions",()=>{
  const config:SessionConfig={...law,programId:"business",subjectId:"principles-of-management"};
  const questions=Array.from({length:8},(_,seed)=>buildIntelligentQuestions(config,50,seed)).flat().filter(q=>q.generationFamily==="management-scenario");
  expect(new Set(questions.map(q=>q.exposureKey)).size).toBe(5);
  expect(questions.every(q=>q.challenge==="Apply"&&q.difficulty===2)).toBe(true);
 });
});
