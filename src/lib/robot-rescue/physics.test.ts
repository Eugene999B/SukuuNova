import { cameraFor, type Scene } from "./renderer";
import { describe, it, expect } from "vitest";
import { LEVELS, STEP, GRAVITY, RADIUS, launch, stepFlight, predict, sweepBox, flightStars, readProgress, unlockedThrough, type Level, type Flight } from "./physics";

const air:Level={...LEVELS[0],goal:{x:200,y:0,w:10,h:4},blocks:[],orbs:[]};
function flying(overrides:Partial<Flight>={}):Flight{return {...launch(air,45,170),x:12,y:22,vx:10,vy:0,...overrides};}

describe("Robot Rescue physical model",()=>{
 it("converts stored energy into kinetic energy for either mass",()=>{
  for(const mass of [1,1.8,2.5]){
   const f=launch({...air,mass},42,270);
   expect(.5*mass*(f.vx*f.vx+f.vy*f.vy)).toBeCloseTo(270,9);
  }
 });
 it("has the same gravitational acceleration for a stationary light or heavy pod",()=>{
  const light=stepFlight(flying({vx:0}),{...air,mass:1});
  const heavy=stepFlight(flying({vx:0}),{...air,mass:1.8});
  expect(light.vy).toBeCloseTo(-GRAVITY*STEP,10);
  expect(heavy.vy).toBeCloseTo(light.vy,10);
 });
 it("tracks the analytical linear-drag solution without frame-sized jumps",()=>{
  let f=flying();const original={...f};
  for(let i=0;i<120;i++)f=stepFlight(f,air);
  const k=.025/air.mass,decay=Math.exp(-k);
  const expectedX=original.x+original.vx*(1-decay)/k;
  const expectedY=original.y-GRAVITY/k+GRAVITY*(1-decay)/(k*k);
  expect(f.x).toBeCloseTo(expectedX,2);
  expect(f.y).toBeCloseTo(expectedY,2);
  expect(f.vx).toBeCloseTo(original.vx*decay,3);
  expect(f.vy).toBeCloseTo(-GRAVITY*(1-decay)/k,2);
 });
 it("wind pushes horizontally and responds to mass",()=>{
  const still=stepFlight(flying(),air);
  const tail=stepFlight(flying(),{...air,wind:2});
  const head=stepFlight(flying(),{...air,wind:-2});
  expect(tail.vx).toBeGreaterThan(still.vx);
  expect(head.vx).toBeLessThan(still.vx);
  const heavy=stepFlight(flying(),{...air,wind:2,mass:2});
  expect(tail.vx-flying().vx).toBeCloseTo(2*(heavy.vx-flying().vx),10);
 });
 it("braking reduces velocity, uses fuel, and stops working at zero fuel",()=>{
  const input=flying({vx:14,vy:-3});
  const brake=stepFlight(input,air,true);
  const coast=stepFlight(input,air,false);
  expect(Math.hypot(brake.vx,brake.vy)).toBeLessThan(Math.hypot(coast.vx,coast.vy));
  expect(brake.fuel).toBeCloseTo(100-22*STEP,9);
  const empty=flying({fuel:0});
  expect(stepFlight(empty,air,true)).toEqual(stepFlight(empty,air,false));
 });
 it("swept collisions catch a thin wall even if an endpoint is far past it",()=>{
  const hit=sweepBox(1,5,40,5,{x:17,y:0,w:.2,h:10});
  expect(hit?.nx).toBe(-1);
  expect(hit?.time).toBeCloseTo((17-RADIUS-1)/39,10);
  const blocked=stepFlight(flying({x:4,y:12,vx:9000,vy:0}),{...air,blocks:[{x:10,y:0,w:.3,h:20}]});
  expect(blocked.status).toBe("missed");
  expect(blocked.x).toBeCloseTo(10-RADIUS,9);
 });
 it("does not mistake the side or underside of a station for its landing pad",()=>{
  const l={...air,goal:{x:15,y:0,w:8,h:8}};
  expect(stepFlight(flying({x:14,y:4,vx:150,vy:0}),l).status).toBe("missed");
  expect(stepFlight(flying({x:18,y:-1,vx:0,vy:150}),l).status).toBe("missed");
 });
 it("requires a gentle top landing and never awards a high-speed impact",()=>{
  const l={...air,goal:{x:15,y:0,w:8,h:4}};
  const high=stepFlight(flying({x:18,y:4.6,vx:0,vy:-30}),l);
  const low=stepFlight(flying({x:18,y:4.56,vx:0,vy:-2}),l);
  expect(high.status).toBe("missed");
  expect(low.status).toBe("rescued");
 });
 it("uses exactly the same steps for forecast and actual flight",()=>{
  for(const level of LEVELS){
   const prediction=predict(level,level.angle,level.energy,true);
   let actual=launch(level,level.angle,level.energy);
   for(let i=0;i<2160&&actual.status==="flying";i++)actual=stepFlight(actual,level,false,true);
   expect(prediction.state).toEqual(actual);
  }
 });
 it("has a tested safe rescue route for every authored mission",()=>{
  const settings=[[42,170],[50,235],[55,290],[29,235],[44,365],[55,310]];
  LEVELS.forEach((level,i)=>{
   const result=predict(level,settings[i][0],settings[i][1],true).state;
   expect(result.status,level.name).toBe("rescued");
   expect(result.impact).toBeLessThanOrEqual(9);
   expect(result.x).toBeGreaterThanOrEqual(level.goal.x+RADIUS);
   expect(result.x).toBeLessThanOrEqual(level.goal.x+level.goal.w-RADIUS);
  });
 });
 it("keeps later missions from completing by launching every default unchanged",()=>{
  for(const level of LEVELS.slice(1))expect(predict(level,level.angle,level.energy,true).state.status,level.name).toBe("missed");
 });
 it("can be rescued with manual braking using the same model as Explorer",()=>{
  const level=LEVELS[0];let state=launch(level,42,170);
  expect(predict(level,42,170,false).state.status).toBe("missed");
  while(state.status==="flying"){
   const brake=state.vy<0&&state.x>=level.goal.x+RADIUS&&state.x<=level.goal.x+level.goal.w-RADIUS&&state.y>level.goal.h;
   state=stepFlight(state,level,brake,false);
  }
  expect(state.status).toBe("rescued");
 });
 it("sanitizes invalid launcher inputs and keeps trajectories finite",()=>{
  const state=predict(LEVELS[0],NaN,Infinity,true).state;
  for(const value of [state.x,state.y,state.vx,state.vy,state.time])expect(Number.isFinite(value)).toBe(true);
 });
 it("awards optional mastery stars without making pickups mandatory",()=>{
  expect(flightStars(flying({status:"rescued",impact:8,fuel:30}))).toBe(1);
  expect(flightStars(flying({status:"rescued",impact:4,collected:[0],fuel:70}))).toBe(3);
  expect(flightStars(flying({status:"missed",impact:0,collected:[0]}))).toBe(0);
 });
});

describe("Robot Rescue local campaign progress",()=>{
 it("recovers safely from malformed or future save data",()=>{
  expect(readProgress("{bad")).toEqual(readProgress(null));
  expect(readProgress('{"version":2,"best":[3]}')).toEqual(readProgress(null));
  const saved=readProgress('{"version":1,"best":[-1,999,"3",null],"mode":"unknown"}');
  expect(saved.best).toEqual([0,3,0,0,0,0]);
  expect(saved.mode).toBe("explorer");
 });
 it("unlocks only the next mission after a contiguous completed sequence",()=>{
  expect(unlockedThrough([0,3,3,3,3,3])).toBe(0);
  expect(unlockedThrough([2,1,0,0,0,0])).toBe(2);
  expect(unlockedThrough([3,3,3,3,3,3])).toBe(5);
 });
});

describe("Robot Rescue camera continuity",()=>{
 it("tracks a high flight without jumping at the vertical follow threshold",()=>{
  const scene:Scene={level:LEVELS[0],flight:flying({y:18.99}),phase:"flying",angle:42,energy:170,preview:[],trail:[],ghost:[],survey:false,reduced:false,time:0,started:true};
  const before=cameraFor(390,300,scene);
  const after=cameraFor(390,300,{...scene,flight:{...scene.flight,y:19.01}});
  expect(Math.abs(after.bottom-before.bottom)).toBeLessThan(.03);
 });
});

describe("Robot Rescue mastery rewards",()=>{
 it("has an attainable three-star flight on every island, including heavy cargo",()=>{
  const mastery=[[29,260],[47,225],[47,325],[18,350],[34,365],[52,235]];
  LEVELS.forEach((level,i)=>{
   const result=predict(level,mastery[i][0],mastery[i][1],true).state;
   expect(flightStars(result),level.name).toBe(3);
   expect(result.fuel).toBeGreaterThanOrEqual(50);
   expect(result.collected).toContain(0);
  });
 });
});
