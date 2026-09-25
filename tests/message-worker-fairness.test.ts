import {expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({sent:new Set<string>()}));
vi.mock("../src/lib/db",()=>({
 db:{schoolLoginDirectory:{findMany:async()=>[{schoolId:"one",uniqueCode:"one"},{schoolId:"two",uniqueCode:"two"}]}},
 withTenant:async(schoolId:string,work:(tx:unknown)=>Promise<unknown>)=>work({
  message:{
   findMany:async()=>state.sent.has(schoolId)?[]:[{id:schoolId,channel:"sms",recipientPhone:schoolId,body:"Notice",templateKey:null,templateVariables:null,mediaUrl:null,status:"queued",attempts:0}],
   updateMany:async({data}:{data:{status:string}})=>{if(data.status==="sent")state.sent.add(schoolId);return{count:1};},
  },
  schoolSettings:{findUnique:async()=>null},
 }),
}));
import {processMessageBatchOnce} from "../src/lib/message-outbox";
it("gives the next school a turn after a full batch instead of repeatedly restarting at the first school",async()=>{
 const delivered:string[]=[];
 const senders={sms:async({phone}:{phone:string})=>{delivered.push(phone);}};
 expect(await processMessageBatchOnce(senders,1)).toBe(1);
 // Keep the first school busy: fairness must not depend on draining its queue.
 state.sent.delete("one");
 expect(await processMessageBatchOnce(senders,1)).toBe(1);
 expect(delivered).toEqual(["one","two"]);
});
