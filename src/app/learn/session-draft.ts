import {z} from "zod";
import type {LearnQuestion} from "./learn-domain";
export const SESSION_DRAFT_KEY="sukuunova-session-v1";
const question=z.custom<LearnQuestion>(value=>{
 if(!value||typeof value!=="object")return false;
 const q=value as LearnQuestion;
 if(!["id","exposureKey","subject","topic","skill","prompt","explanation"].every(k=>typeof (q as unknown as Record<string,unknown>)[k]==="string"))return false;
 if(!["single","multi","fill","short","numeric","boolean"].includes(q.kind)||!Number.isInteger(q.difficulty)||q.difficulty<1||q.difficulty>5)return false;
 if(q.kind==="single"||q.kind==="multi"){if(!Array.isArray(q.options)||!q.options.every(o=>typeof o.id==="string"&&typeof o.label==="string"))return false;const answers=Array.isArray(q.answer)?q.answer:[q.answer];if(!answers.length||!answers.every(a=>q.options!.some(o=>o.id===a)))return false;}
 else if(q.kind==="numeric"&&(typeof q.answer!=="number"||!Number.isFinite(q.answer)))return false;
 else if(q.kind==="boolean"&&typeof q.answer!=="boolean")return false;
 else if(["fill","short"].includes(q.kind)&&typeof q.answer!=="string")return false;
 if(q.stimulus){const s=q.stimulus;if(s.kind==="passage")return typeof s.text==="string";if(s.kind==="table")return Array.isArray(s.columns)&&s.columns.every(v=>typeof v==="string")&&Array.isArray(s.rows)&&s.rows.every(row=>Array.isArray(row)&&row.every(v=>typeof v==="string"));if(s.kind==="diagram")return ["triangle","rectangle","angle","coordinate-grid"].includes(s.diagram)&&typeof s.ariaLabel==="string";return false;}
 return true;
});
const schema=z.object({
 config:z.object({lane:z.enum(["school","exam","university","skills"]),programId:z.string(),levelId:z.string(),subjectId:z.string(),topicId:z.string(),mode:z.enum(["topic","adaptive","random","timed","weakness"]),count:z.number().int().min(1).max(100)}),
 questions:z.array(question).min(1).max(100),index:z.number().int().min(0),response:z.union([z.string(),z.array(z.string()),z.number().finite(),z.boolean()]),submitted:z.boolean(),lastCorrect:z.boolean(),correct:z.number().int().min(0),savedAt:z.number().finite(),
});
export type SessionDraft=z.infer<typeof schema>;
export function normalizeDraft(value:unknown,now=Date.now()):SessionDraft|null{
 const parsed=schema.safeParse(value);if(!parsed.success)return null;const d=parsed.data;
 if(d.index>=d.questions.length||d.correct>d.index+(d.submitted?1:0)||d.savedAt>now+60_000||now-d.savedAt>86_400_000)return null;
 return d;
}
