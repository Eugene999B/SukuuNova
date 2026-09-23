import type { LearnQuestion } from "../learn-domain";
export const REVIEW_KEY="sukuunova-remember-v1";
const DAY=86_400_000;
export type ReviewCard={id:string;subject:string;topic:string;prompt:string;answer:string;explanation:string;due:number;interval:number;reviews:number;added:number};
function answerText(q:LearnQuestion){const answers=Array.isArray(q.answer)?q.answer:[q.answer];return answers.map(a=>q.options?.find(o=>o.id===a)?.label??String(a)).join("; ");}
export function normalizeCards(value:unknown):ReviewCard[]{if(!Array.isArray(value))return [];return value.filter((v):v is ReviewCard=>!!v&&typeof v==="object"&&["id","subject","topic","prompt","answer","explanation"].every(k=>typeof (v as Record<string,unknown>)[k]==="string")&&["due","interval","reviews","added"].every(k=>typeof (v as Record<string,unknown>)[k]==="number"&&Number.isFinite((v as Record<string,number>)[k])&&(v as Record<string,number>)[k]>=0)).slice(0,200);}
export function rememberQuestion(cards:ReviewCard[],question:LearnQuestion,correct:boolean,now=Date.now()):ReviewCard[]{
 // A passage/diagram is essential to understanding these questions; do not save an incomplete card.
 if(question.stimulus)return cards;
 const prior=cards.find(c=>c.id===question.exposureKey);
 const card:ReviewCard={id:question.exposureKey,subject:question.subject,topic:question.topic,prompt:question.prompt,answer:answerText(question),explanation:question.explanation,due:correct?(prior?.due??now+DAY):now,interval:correct?(prior?.interval??1):0,reviews:prior?.reviews??0,added:prior?.added??now};
 return [card,...cards.filter(c=>c.id!==card.id)].slice(0,200);
}
export function gradeRecall(card:ReviewCard,grade:"again"|"effort"|"easy",now=Date.now()):ReviewCard{
 const interval=grade==="again"?0:grade==="effort"?Math.max(1,Math.min(30,Math.round(card.interval*1.5))):Math.max(2,Math.min(60,card.interval*2));
 return {...card,interval,reviews:card.reviews+1,due:now+(grade==="again"?10*60_000:interval*DAY)};
}
export function captureReview(question:LearnQuestion,correct:boolean){try{const cards=normalizeCards(JSON.parse(localStorage.getItem(REVIEW_KEY)||"[]"));localStorage.setItem(REVIEW_KEY,JSON.stringify(rememberQuestion(cards,question,correct)));}catch{/* Public practice works even if storage is blocked. */}}
