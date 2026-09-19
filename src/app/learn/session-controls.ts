import type { QuestionKind } from "./learn-domain";
export function sessionSize(value:number){return Number.isFinite(value)?Math.max(1,Math.min(100,Math.floor(value))):10;}
export function hasLearningAnswer(kind:QuestionKind,response:unknown){
 if(kind==="multi")return Array.isArray(response)&&response.length>0;
 if(kind==="boolean")return typeof response==="boolean";
 if(kind==="numeric")return (typeof response==="string"||typeof response==="number")&&String(response).trim()!==""&&Number.isFinite(Number(response));
 return typeof response==="string"&&response.trim().length>0;
}
