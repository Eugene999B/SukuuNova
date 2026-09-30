import { describe, expect, it } from "vitest";
import { catalogFor, formattedLearningAnswer, isCorrectAnswer, type SessionConfig } from "./learn-domain";
import { buildNursingQuestions, nursingCapacityForSelection } from "./nursing-foundry";
import { buildLearningSession } from "./learning-engine";
const config=(programId:string,subjectId:string,topicId="all"):SessionConfig=>({lane:"university",programId,levelId:"level-100",subjectId,topicId,mode:"topic",count:12,seed:730});
describe("Ghanaian nursing and midwifery pathways",()=>{
 it("keeps diploma, degree, midwifery and specialist paths distinct without semesters",()=>{
  const programmes=catalogFor("university").programs;
  for(const [id,length] of [["nursing-diploma",3],["nursing",4],["midwifery-diploma",3],["paediatric-nursing",2]] as const){
   const programme=programmes.find(p=>p.id===id)!;
   expect(programme.levels).toHaveLength(length);
   expect(programme.levels.every(level=>!level.label.toLowerCase().includes("semester"))).toBe(true);
  }
  expect(programmes.find(p=>p.id==="paediatric-nursing")?.description).toContain("post-basic");
 });
 it.each(["nursing-diploma","midwifery-diploma"])("serves all seven timetable foundations for %s",programId=>{
  for(const subject of ["anatomy-and-physiology","fundamentals-of-nursing","microbiology","therapeutic-communication","professional-adjustment","nursing-informatics","first-aid-emergency-preparedness-and-disaster-management"]){
   const qs=buildLearningSession(config(programId,subject));
   expect(qs.length,subject).toBeGreaterThan(0);
   expect(qs.every(q=>q.exposureKey.startsWith("nursing:"))).toBe(true);
   for(const q of qs)expect(isCorrectAnswer(q,q.answer),q.prompt).toBe(true);
  }
 });
 it("separates communication from medicines and informatics from bedside disease questions",()=>{
  const qs=buildNursingQuestions(config("midwifery-diploma","therapeutic-communication"),24,1);
  expect(qs).toHaveLength(24);
  expect(qs.every(q=>/listening|communication/i.test(q.topic))).toBe(true);
  expect(new Set(qs.map(q=>q.kind)).size).toBe(3);
  expect(qs.some(q=>q.stimulus?.kind==="passage")).toBe(true);
  expect(qs.some(q=>q.stimulus?.kind==="table")).toBe(true);
  const it=buildNursingQuestions(config("nursing-diploma","nursing-informatics"),24,1);
  expect(it.every(q=>/records|security/i.test(q.topic))).toBe(true);
  expect(it.some(q=>q.skill==="individual authentication")).toBe(true);
 });
 it("uses stable tasks, finite capacity and correctly linked options",()=>{
  const c=config("midwifery-diploma","microbiology");
  const a=buildNursingQuestions(c,100,1),b=buildNursingQuestions(c,100,2);
  expect(new Set(a.map(q=>q.exposureKey))).toEqual(new Set(b.map(q=>q.exposureKey)));
  expect(nursingCapacityForSelection(c)).toBe(a.length);
  for(const q of a){
   expect(formattedLearningAnswer(q).length).toBeGreaterThan(2);
   if(q.kind==="single"){
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options!.map(o=>o.label)).size).toBe(4);
   }
  }
 });
 it("does not substitute general nursing into unavailable specialist content",()=>{
  const c={...config("paediatric-nursing","advanced-paediatric-pharmacology"),levelId:"level-200"};
  expect(buildLearningSession(c)).toEqual([]);
  expect(buildLearningSession(config("paediatric-nursing","primary-care-of-children-and-adolescents")).length).toBeGreaterThan(0);
 });
 it("shows answer labels and rejects blank numeric answers",()=>{
  const q=buildNursingQuestions(config("nursing-diploma","microbiology"),24,4).find(q=>q.kind==="single")!;
  expect(formattedLearningAnswer(q)).toBe(q.options!.find(o=>o.id===q.answer)!.label);
  expect(isCorrectAnswer({...q,kind:"numeric",answer:0},"")).toBe(false);
  expect(isCorrectAnswer({...q,kind:"numeric",answer:0},"0")).toBe(true);
 });
});
