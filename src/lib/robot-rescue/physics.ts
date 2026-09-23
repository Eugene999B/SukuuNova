export type Box={x:number;y:number;w:number;h:number};
export type Point={x:number;y:number};
export type Flight={x:number;y:number;vx:number;vy:number;time:number;fuel:number;status:"flying"|"rescued"|"missed";reason:string;impact:number;collected:number[];braking:boolean};
export type Level={id:string;name:string;region:string;robot:string;story:string;lesson:string;hint:string;angle:number;energy:number;mass:number;wind:number;goal:Box;blocks:Box[];orbs:Point[];sky:string};
export type Progress={version:number;best:number[];mode:"explorer"|"precision"};
export const STEP = 1 / 120;
export const GRAVITY = 9.81;
export const RADIUS = 0.55;
export const SAVE_KEY = "sukuunova-signal-isles-v1";
export const LEVELS:Level[] = [
 {id:"first-signal",name:"First signal",region:"Dawn harbour",robot:"Pip",story:"Pip kept the harbour light running through the storm. Reach the green pad and bring our little lookout home.",lesson:"A launch has two parts: horizontal motion and vertical motion. Gravity changes the vertical part throughout the flight.",hint:"Start near 42° and 170 J. The dotted line predicts your flight. In Explorer, landing assist brakes as you approach the pad.",angle:42,energy:170,mass:1,wind:0,goal:{x:26,y:0,w:10,h:4},blocks:[],orbs:[{x:18,y:11}],sky:"dawn"},
 {id:"high-ground",name:"Higher ground",region:"Cloud garden",robot:"Moss",story:"Moss is guarding the island seed bank on a high terrace. Reach the terrace without striking its cliff.",lesson:"A higher destination needs more gravitational potential energy. A higher arc can clear the cliff, but also changes the distance travelled.",hint:"Give the pod enough height to clear the terrace. Compare the landing point after changing only the angle.",angle:38,energy:180,mass:1,wind:0,goal:{x:31,y:0,w:9,h:7},blocks:[],orbs:[{x:21,y:17}],sky:"garden"},
 {id:"headwind",name:"Against the wind",region:"Windward pass",robot:"Kite",story:"Kite's weather mast survived, but the rescue route crosses a rocky ridge. The steady wind pushes your pod back toward the harbour.",lesson:"The wind adds a horizontal force. The same launch can travel a different distance when a force changes its horizontal velocity.",hint:"Clear the ridge first. More launch energy can counter the headwind. Watch the live horizontal speed.",angle:35,energy:170,mass:1,wind:-1.5,goal:{x:29,y:0,w:9,h:5},blocks:[{x:17,y:0,w:2.4,h:9}],orbs:[{x:19,y:17}],sky:"wind"},
 {id:"under-canopy",name:"Under the canopy",region:"Old observatory",robot:"Luma",story:"Luma's archive is safe below a suspended rock shelf. A very high arc will strike the overhang. Find a lower route through.",lesson:"Increasing angle is not always helpful. Trajectory design means satisfying both the height limit and the distance needed.",hint:"A lower angle passes below the overhang. Change the energy to tune the range, then slow down over the pad.",angle:50,energy:180,mass:1,wind:0.6,goal:{x:31,y:0,w:10,h:4},blocks:[{x:16,y:13,w:10,h:2.5}],orbs:[{x:23,y:9}],sky:"dusk"},
 {id:"precious-cargo",name:"Precious cargo",region:"Tidal nursery",robot:"Coral",story:"Coral needs a spare battery to restart the nursery pumps. Your pod is carrying extra mass. The launcher stores energy, so this heavier flight needs a new plan.",lesson:"Launch speed is sqrt(2 × energy ÷ mass). With the same energy, more mass means less speed. Gravity's acceleration stays the same.",hint:"The pod now has a mass of 1.8 kg. Increase launch energy instead of assuming the old setting will travel as far.",angle:44,energy:170,mass:1.8,wind:0,goal:{x:28,y:0,w:10,h:5},blocks:[],orbs:[{x:21,y:12}],sky:"tidal"},
 {id:"light-the-chain",name:"Light the chain",region:"Signal summit",robot:"Sol",story:"Sol holds the last link in the rescue network. Clear the summit wall, reach the raised station and reconnect every island you have visited.",lesson:"Combine your evidence: launch energy, angle, mass, wind and braking all affect the outcome. Test a prediction, inspect the flight, then revise it.",hint:"You need enough height for the wall and enough range for the summit. The tailwind helps your range but also raises your landing speed.",angle:35,energy:170,mass:1,wind:1.1,goal:{x:37,y:0,w:9,h:7},blocks:[{x:23,y:0,w:2.5,h:11}],orbs:[{x:26,y:20}],sky:"night"}
];
export function clamp(value:number, min:number, max:number) { return Math.max(min, Math.min(max, value)); }
export function launch(level:Level, angle:number, energy:number):Flight {
 const a = clamp(Number.isFinite(angle) ? angle : level.angle, 15, 75) * Math.PI / 180;
 const e = clamp(Number.isFinite(energy) ? energy : level.energy, 80, 600);
 const speed = Math.sqrt(2 * e / level.mass);
 return {x:4,y:4+RADIUS+0.03,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,time:0,fuel:100,status:"flying",reason:"",impact:0,collected:[],braking:false};
}
export function sweepBox(x:number,y:number,nx:number,ny:number,box:Box) {
 const mins=[box.x-RADIUS,box.y-RADIUS], maxs=[box.x+box.w+RADIUS,box.y+box.h+RADIUS];
 const p=[x,y], d=[nx-x,ny-y];
 let enter=0, exit=1, normalX=0, normalY=0;
 for(let axis=0;axis<2;axis++){
  if(Math.abs(d[axis])<1e-10){if(p[axis]<mins[axis]||p[axis]>maxs[axis])return null;continue;}
  let near=(mins[axis]-p[axis])/d[axis], far=(maxs[axis]-p[axis])/d[axis];
  const direction=d[axis]>0?-1:1;
  if(near>far){const swap=near;near=far;far=swap;}
  if(near>=enter){enter=near;normalX=axis===0?direction:0;normalY=axis===1?direction:0;}
  exit=Math.min(exit,far);
  if(enter>exit)return null;
 }
 if(enter<0||enter>1||exit<0||(normalX===0&&normalY===0))return null;
 return {time:enter,nx:normalX,ny:normalY};
}
export function stepFlight(state:Flight,level:Level,brake=false,assist=false):Flight {
 if(state.status!=="flying")return state;
 const next:Flight={...state,collected:[...state.collected]};
 const automatic=assist&&state.vy<0&&state.x>=level.goal.x+RADIUS&&state.x<=level.goal.x+level.goal.w-RADIUS&&state.y>level.goal.h;
 const braking=(brake||automatic)&&state.fuel>0;
 const resistance=0.025+(braking?2.6:0);
 const ax=(level.wind-resistance*state.vx)/level.mass;
 const ay=-GRAVITY-resistance*state.vy/level.mass;
 const nx=state.x+state.vx*STEP+0.5*ax*STEP*STEP;
 const ny=state.y+state.vy*STEP+0.5*ay*STEP*STEP;
 next.vx+=ax*STEP;next.vy+=ay*STEP;next.time+=STEP;
 next.fuel=Math.max(0,state.fuel-(braking?22*STEP:0));next.braking=braking;
 const surfaces=[{x:0,y:0,w:8,h:4},...level.blocks,level.goal];
 let earliest:ReturnType<typeof sweepBox>=null, surface=-1;
 for(let i=0;i<surfaces.length;i++){
  const hit=sweepBox(state.x,state.y,nx,ny,surfaces[i]);
  if(hit&&(!earliest||hit.time<earliest.time)){earliest=hit;surface=i;}
 }
 next.x=nx;next.y=ny;
 if(earliest){
  next.x=state.x+(nx-state.x)*earliest.time;
  next.y=state.y+(ny-state.y)*earliest.time;
  next.impact=Math.hypot(next.vx,next.vy);
  const onPad=surface===surfaces.length-1&&earliest.ny===1
   &&next.x>=level.goal.x+RADIUS&&next.x<=level.goal.x+level.goal.w-RADIUS;
  if(onPad&&next.impact<=9){
   next.status="rescued";next.reason="Soft landing. "+level.robot+" is aboard.";
  }else{
   next.status="missed";
   next.reason=onPad?"The pad was reached, but the landing was too fast. Brake earlier on descent."
    :surface===surfaces.length-1?"The pod struck the station cliff or pad edge. Aim above the platform before descending."
    :surface===0?"The pod returned to the launch island. Increase energy or use a shallower angle."
    :"The flight intersected a rock face. Adjust the arc to pass around it.";
  }
 }
 for(let i=0;i<level.orbs.length;i++){
  if(!next.collected.includes(i)&&Math.hypot(next.x-level.orbs[i].x,next.y-level.orbs[i].y)<1.1)next.collected.push(i);
 }
 if(next.status==="flying"&&(next.y<-1||next.x<-3||next.x>53||next.y>45||next.time>18)){
  next.status="missed";next.impact=Math.hypot(next.vx,next.vy);
  next.reason=next.x<level.goal.x?"The pod fell short of the landing pad. Try more energy, or a lower angle if the arc was very high."
   :next.x>level.goal.x+level.goal.w?"The pod passed the island. Reduce energy or brake before passing the pad."
   :"The flight left the safe rescue area. Recheck your angle and energy.";
 }
 return next;
}
export function predict(level:Level,angle:number,energy:number,assist:boolean) {
 let state=launch(level,angle,energy);
 const points=[{x:state.x,y:state.y}];
 for(let i=0;i<2160&&state.status==="flying";i++){
  state=stepFlight(state,level,false,assist);
  if(i%8===0||state.status!=="flying")points.push({x:state.x,y:state.y});
 }
 return {points,state};
}
export function flightStars(state:Flight) {
 return state.status!=="rescued"?0:1+Number(state.collected.length>0)+Number(state.impact<=5);
}
export function readProgress(raw:string|null):Progress {
 const clean:Progress={version:1,best:Array(LEVELS.length).fill(0),mode:"explorer"};
 try{
  const data=JSON.parse(raw||"null");
  if(!data||data.version!==1||!Array.isArray(data.best))return clean;
  clean.best=clean.best.map((_,i)=>Number.isInteger(data.best[i])?clamp(data.best[i],0,3):0);
  clean.mode=data.mode==="precision"?"precision":"explorer";
 }catch{}
 return clean;
}
export function unlockedThrough(best:number[]) {
 let index=0;
 while(index<LEVELS.length-1&&best[index]>0)index++;
 return index;
}
