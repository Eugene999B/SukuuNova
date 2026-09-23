export type MarketPlan = { stock:number; price:number };
export const MARKET_DAYS = [
 {name:"A warm school afternoon", cost:3, demand:54, sensitivity:7, fee:12, note:"People want a cool fruit cup. Higher prices reduce demand in this simplified market."},
 {name:"A quieter rainy day", cost:3, demand:39, sensitivity:6, fee:10, note:"Fewer visitors today. Buying more stock does not create more customers."},
 {name:"The weekend fair", cost:4, demand:78, sensitivity:8, fee:18, note:"More visitors, but ingredients and the stall cost more."},
] as const;
export function bounded(value:number,min:number,max:number){return Number.isFinite(value)?Math.max(min,Math.min(max,value)):min;}
export function marketResult(plan:MarketPlan, challenge:number){
 const day=MARKET_DAYS[((Math.trunc(challenge)%3)+3)%3];
 const stock=Math.round(bounded(plan.stock,0,100)),price=Math.round(bounded(plan.price,1,15));
 const demand=Math.max(0,day.demand-day.sensitivity*(price-day.cost));
 const sold=Math.min(stock,demand),revenue=sold*price,cost=stock*day.cost+day.fee;
 return {sold,unsold:stock-sold,demand,revenue,cost,profit:revenue-cost,breakEven:price?Math.ceil(cost/price):0};
}
export type EnergyPlan = {solar:number; batteries:number; clinic:boolean; homes:boolean; library:boolean};
export const ENERGY_COST = {solar:200,batteries:150};
export function energyResult(plan:EnergyPlan, cloudy=false){
 const solar=Math.round(bounded(plan.solar,0,8)),batteries=Math.round(bounded(plan.batteries,0,8));
 const generation=solar*(cloudy?9:15);
 const daytime=(plan.clinic?10:0)+(plan.homes?12:0)+(plan.library?8:0);
 const nighttime=(plan.clinic?10:0)+(plan.homes?12:0)+(plan.library?4:0);
 const stored=Math.min(batteries*10,Math.max(0,generation-daytime));
 const cost=solar*200+batteries*150;
 return {generation,daytime,nighttime,stored,cost,shortfall:Math.max(0,daytime-generation)+Math.max(0,nighttime-stored),surplus:Math.max(0,generation-daytime-stored),withinBudget:cost<=1500,success:cost<=1500&&generation>=daytime&&stored>=nighttime&&plan.clinic&&plan.homes&&plan.library};
}
export const EVIDENCE_CASES = [
 {title:"Where did the water go?", intro:"The school tank loses water overnight, when taps should be closed. Which next step is best supported by these readings?", columns:["Night","Kitchen pipe","Litres lost"],rows:[["Monday","Open","120"],["Tuesday","Closed","15"],["Wednesday","Open","118"]],
 choices:["Inspect the kitchen pipe for a leak.","Buy a bigger tank immediately.","Conclude that rain caused the loss."],answer:0,why:"Loss was much lower with the kitchen pipe closed, then rose when it reopened. Inspect that pipe next. This pattern suggests a cause; a direct inspection is still needed.",prompt:"What additional observation would help confirm the leak?"},
 {title:"Which garden grew faster?",intro:"Two plots used different watering methods. Compare growth from the starting height—not just the final height.",columns:["Plot","Starting height","Final height"],rows:[["A","12 cm","20 cm"],["B","5 cm","16 cm"]],
 choices:["Plot A grew more because it finished taller.","Plot B grew more: 11 cm compared with 8 cm.","Both grew equally."],answer:1,why:"A grew 20 − 12 = 8 cm. B grew 16 − 5 = 11 cm. Starting values matter. This alone does not prove watering caused the difference.",prompt:"Which other conditions should be kept the same in a fair test?"},
 {title:"Did the reading club help?",intro:"The librarian wants to compare participation in two classes. The classes have different numbers of learners.",columns:["Class","Joined the club","Class size"],rows:[["A","18","30"],["B","20","40"]],
 choices:["B has the higher participation rate.","Both have the same rate.","A has the higher participation rate."],answer:2,why:"A: 18/30 = 60%. B: 20/40 = 50%. B has more members, but A has a higher proportion. Counts and percentages answer different questions.",prompt:"How would you explain this difference to the librarian?"},
] as const;
export type ProjectNote = {id:string;title:string;goal:string;evidence:string;reflection:string;nextStep:string;updatedAt:number};
export const PROJECT_KEY="sukuunova-projects-v1";
export function normalizeProjects(value:unknown):ProjectNote[]{
 if(!Array.isArray(value))return [];
 return value.filter((v):v is ProjectNote=>!!v&&typeof v==="object"&&["id","title","goal","evidence","reflection","nextStep"].every(k=>typeof (v as Record<string,unknown>)[k]==="string")&&typeof v.updatedAt==="number"&&Number.isFinite(v.updatedAt)).slice(0,30).map(v=>({...v,title:v.title.slice(0,160),goal:v.goal.slice(0,4000),evidence:v.evidence.slice(0,8000),reflection:v.reflection.slice(0,4000),nextStep:v.nextStep.slice(0,4000)}));
}
