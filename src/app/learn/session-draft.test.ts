import {it,expect} from "vitest";
import {normalizeDraft} from "./session-draft";
const draft={config:{lane:"school",programId:"ghana",levelId:"jhs-1",subjectId:"mathematics",topicId:"all",mode:"topic",count:5},questions:[{id:"q",exposureKey:"q",kind:"numeric",subject:"Maths",topic:"Arithmetic",skill:"Add",prompt:"2 + 2",answer:4,explanation:"Two plus two is four.",difficulty:1}],index:0,response:4,submitted:true,lastCorrect:true,correct:1,savedAt:1000};
it("restores an answered question without asking the learner to submit again",()=>{expect(normalizeDraft(draft,2000)?.submitted).toBe(true);});
it("rejects stale, corrupt and impossible sessions",()=>{expect(normalizeDraft(draft,90_000_000)).toBeNull();expect(normalizeDraft({...draft,index:4},2000)).toBeNull();expect(normalizeDraft({...draft,questions:[{}]},2000)).toBeNull();expect(normalizeDraft({...draft,correct:99},2000)).toBeNull();});
