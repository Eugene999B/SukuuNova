import { RADIUS, type Box, type Flight, type Level, type Point } from "./physics";

// Authored game artwork palette. The play world keeps its own lighting across
// app themes, like an illustration; surrounding controls use design tokens.
const C={ink:"#061323",deep:"#082339",sea:"#10465b",foam:"#61dfd0",mint:"#a0ffe3",white:"#f3ffff",rock:"#1d4b59",rockDark:"#103241",soil:"#366e6a",grass:"#74d4a3",gold:"#ffc970",orange:"#ff925d",danger:"#ff7282"};
export type Camera={scale:number;left:number;bottom:number;width:number;height:number};
export type Scene={level:Level;flight:Flight;phase:string;angle:number;energy:number;preview:Point[];trail:Point[];ghost:Point[];survey:boolean;reduced:boolean;time:number;started:boolean};
export function cameraFor(width:number,height:number,scene:Scene):Camera{
 const wide=width/height>1.55||scene.survey||!scene.started;
 const span=wide?51:30;
 const scale=Math.min(width/span,height/24);
 const visible=width/scale;
 const left=wide?-1:Math.max(-1,Math.min(51-visible,scene.phase==="aiming"?-1:scene.flight.x-visible*.38));
 const bottom=wide?-3:Math.max(-3,scene.flight.y-22);
 return {scale,left,bottom,width,height};
}
export function worldPoint(camera:Camera,x:number,y:number):Point{
 return {x:x/camera.scale+camera.left,y:(camera.height-y)/camera.scale+camera.bottom};
}
export function drawScene(ctx:CanvasRenderingContext2D,width:number,height:number,scene:Scene):Camera{
 const cam=cameraFor(width,height,scene),s=cam.scale,t=scene.reduced?0:scene.time;
 const X=(x:number)=>(x-cam.left)*s,Y=(y:number)=>height-(y-cam.bottom)*s;
 const night=scene.level.sky==="night",dusk=scene.level.sky==="dusk";
 const sky=ctx.createLinearGradient(0,0,0,height);
 sky.addColorStop(0,night?"#09112d":dusk?"#29284f":"#123953");
 sky.addColorStop(.7,night?"#193558":dusk?"#9e6973":"#487d8d");
 sky.addColorStop(1,"#73b5ad");ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
 // Small deterministic stars, distant sun, soft cloud bands and parallax islands.
 if(night){ctx.fillStyle=C.white;for(let i=0;i<55;i++){ctx.globalAlpha=.25+(i%5)*.12;ctx.beginPath();ctx.arc((i*137.51)%width,(i*61.31)%(height*.65),i%4===0?1.6:.7,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
 const sunX=width*.76-cam.left*s*.05,sunY=height*.22;
 const halo=ctx.createRadialGradient(sunX,sunY,4,sunX,sunY,height*.45);
 halo.addColorStop(0,night?"#8dbfe940":"#ffe0a34a");halo.addColorStop(1,"#ffffff00");
 ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
 ctx.fillStyle=night?"#c8e5ee":"#ffdda2";ctx.beginPath();ctx.arc(sunX,sunY,night?18:29,0,Math.PI*2);ctx.fill();
 for(let layer=0;layer<3;layer++){
  ctx.fillStyle=["#234c6655","#28586f88","#255868"][layer];
  ctx.beginPath();ctx.moveTo(0,height);
  for(let i=-1;i<=12;i++){const x=i*width/10-cam.left*s*(.04+layer*.025);const y=height*(.61+layer*.07)-Math.sin(i*2.31+layer)*height*.085;ctx.lineTo(x,y);ctx.lineTo(x+width/28,y-height*.09);}
  ctx.lineTo(width+200,height);ctx.closePath();ctx.fill();
 }
 const seaY=Y(0);const water=ctx.createLinearGradient(0,seaY,0,height);
 water.addColorStop(0,C.sea);water.addColorStop(1,C.ink);ctx.fillStyle=water;ctx.fillRect(0,seaY,width,height-seaY);
 ctx.strokeStyle=C.foam;ctx.lineWidth=1;
 for(let i=0;i<26;i++){const x=((i*79+t*7)% (width+120))-60,y=seaY+6+(i%7)*8;ctx.globalAlpha=.08+(i%3)*.04;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+20+(i%4)*12,y);ctx.stroke();}ctx.globalAlpha=1;
 const island=(box:Box,index:number)=>{
  const x=X(box.x),y=Y(box.y+box.h),w=box.w*s,h=box.h*s;
  ctx.fillStyle=C.rockDark;ctx.fillRect(x,y,w,h);
  ctx.fillStyle=C.rock;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*.5,y);ctx.lineTo(x+w*.36,y+h);ctx.lineTo(x+w*.15,y+h);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#6facaa40";ctx.lineWidth=1;for(let k=1;k<5;k++){ctx.beginPath();ctx.moveTo(x+w*k/5,y+13);ctx.lineTo(x+w*(k+.3)/5,y+h*.68);ctx.stroke();}
  ctx.fillStyle=C.soil;ctx.fillRect(x,y,w,8);
  ctx.fillStyle=C.grass;ctx.fillRect(x,y-2,w,4);
  for(let k=0;k<Math.floor(w/16);k++){ctx.strokeStyle=k%2?C.grass:"#479f86";ctx.beginPath();ctx.moveTo(x+7+k*16,y);ctx.lineTo(x+5+k*16,y-5-(k%3)*2);ctx.stroke();}
  // Small habitat plants at platform ends leave landing geometry readable.
  if(index!==1){for(const edge of [box.x+.8,box.x+box.w-.8]){ctx.strokeStyle=C.soil;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(edge),y);ctx.lineTo(X(edge)-3,y-22);ctx.stroke();ctx.fillStyle="#55b58e";ctx.beginPath();ctx.ellipse(X(edge)-5,y-23,10,6,-.4,0,Math.PI*2);ctx.fill();}}
 };
 island({x:0,y:0,w:8,h:4},0);
 scene.level.blocks.forEach((b,i)=>island(b,i+1));
 island(scene.level.goal,2);
 // Launch apparatus: anchored base, pivot, energy arc and barrel.
 const lx=X(4),ly=Y(4.25),a=scene.angle*Math.PI/180;
 ctx.fillStyle=C.ink;ctx.beginPath();ctx.roundRect(lx-24,ly+2,48,12,4);ctx.fill();
 ctx.strokeStyle="#527b91";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(lx-12,ly+5);ctx.lineTo(lx,ly-12);ctx.lineTo(lx+12,ly+5);ctx.stroke();
 ctx.save();ctx.translate(lx,ly-8);ctx.rotate(-a);ctx.fillStyle="#c7dedc";ctx.beginPath();ctx.roundRect(-8,-8,38,16,5);ctx.fill();ctx.fillStyle=C.ink;ctx.fillRect(19,-5,12,10);ctx.fillStyle=C.foam;ctx.fillRect(-6,-5,9,10);ctx.restore();
 // Destination is a solid, visibly bounded docking pad.
 const g=scene.level.goal,gx=X(g.x+.25),gy=Y(g.h),gw=(g.w-.5)*s;
 ctx.shadowColor=C.foam;ctx.shadowBlur=12;ctx.fillStyle=C.foam;ctx.fillRect(gx,gy-4,gw,4);ctx.shadowBlur=0;
 ctx.strokeStyle="#b8ffe860";ctx.lineWidth=1;ctx.setLineDash([5,6]);ctx.strokeRect(gx,gy-2.7*s,gw,2.7*s);ctx.setLineDash([]);
 for(const xx of [gx+3,gx+gw-3]){ctx.fillStyle=C.ink;ctx.fillRect(xx-3,gy-26,6,24);ctx.fillStyle=C.mint;ctx.beginPath();ctx.arc(xx,gy-28,4,0,Math.PI*2);ctx.fill();}
 // Rescue robot on the far edge of the platform.
 const rx=X(g.x+g.w-1.8),ry=gy-15-Math.sin(t*2)*2;
 ctx.fillStyle=C.gold;ctx.beginPath();ctx.roundRect(rx-9,ry-12,18,18,5);ctx.fill();ctx.fillStyle=C.ink;ctx.beginPath();ctx.roundRect(rx-6,ry-8,12,6,2);ctx.fill();ctx.fillStyle=C.white;ctx.fillRect(rx-4,ry-6,3,2);ctx.fillRect(rx+1,ry-6,3,2);
 ctx.strokeStyle=C.gold;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(rx-5,ry+5);ctx.lineTo(rx-5,ry+11);ctx.moveTo(rx+5,ry+5);ctx.lineTo(rx+5,ry+11);ctx.stroke();
 const label=(text:string,x:number,y:number,color=C.white)=>{
  ctx.font="600 11px system-ui";ctx.textAlign="center";const w=ctx.measureText(text).width+16;ctx.fillStyle="#061323dc";ctx.beginPath();ctx.roundRect(x-w/2,y-12,w,22,7);ctx.fill();ctx.fillStyle=color;ctx.fillText(text,x,y+3);
 };
 if(gx+gw>0&&gx<width)label(scene.level.robot+" · LAND HERE",gx+gw/2,gy-3.4*s,C.mint);
 else label("LANDING PAD →",width-85,45,C.mint);
 if(lx>0&&lx<width)label("LAUNCH",lx,ly+40);
 // Optional energy pickup: a spatial challenge, never required for rescue.
 scene.level.orbs.forEach((orb,i)=>{if(scene.flight.collected.includes(i)&&scene.phase!=="aiming")return;const ox=X(orb.x),oy=Y(orb.y)+Math.sin(t*2+i)*3;ctx.save();ctx.translate(ox,oy);ctx.rotate(Math.PI/4);ctx.shadowBlur=15;ctx.shadowColor=C.gold;ctx.fillStyle=C.gold;ctx.fillRect(-5,-5,10,10);ctx.shadowBlur=0;ctx.strokeStyle="#fff4ce";ctx.strokeRect(-8,-8,16,16);ctx.restore();});
 const path=(points:Point[],color:string,dashed=false)=>{
  if(points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dashed?[3,7]:[]);ctx.beginPath();points.forEach((p,i)=>{if(i===0)ctx.moveTo(X(p.x),Y(p.y));else ctx.lineTo(X(p.x),Y(p.y));});ctx.stroke();ctx.setLineDash([]);
 };
 path(scene.ghost,"#ffbd7860",true);
 if(scene.phase==="aiming")path(scene.preview,"#b4fff0b0",true);
 path(scene.trail,"#95fbe6b0");
 const pod=scene.phase==="aiming"?{x:4,y:4+RADIUS+.03,vx:0,vy:0,braking:false}:scene.flight;
 const px=X(pod.x),py=Y(pod.y),radius=Math.max(8,RADIUS*s);
 if(pod.braking&&scene.phase==="flying"){
  ctx.fillStyle="#7efae580";ctx.beginPath();ctx.moveTo(px-radius*.7,py+radius*.4);ctx.lineTo(px,py+radius*2.7+Math.sin(t*45)*3);ctx.lineTo(px+radius*.7,py+radius*.4);ctx.closePath();ctx.fill();
  ctx.strokeStyle=C.foam;ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,radius*1.8,Math.PI*.05,Math.PI*.95);ctx.stroke();
 }
 ctx.save();ctx.translate(px,py);ctx.rotate(scene.phase==="flying"?Math.atan2(-pod.vy,pod.vx)*.12:0);
 ctx.shadowBlur=16;ctx.shadowColor=C.foam;ctx.fillStyle="#dfefe8";ctx.beginPath();ctx.roundRect(-radius,-radius,radius*2,radius*1.85,radius*.4);ctx.fill();ctx.shadowBlur=0;
 ctx.fillStyle=C.ink;ctx.beginPath();ctx.roundRect(-radius*.78,-radius*.7,radius*1.56,radius*.84,radius*.2);ctx.fill();
 ctx.fillStyle=C.foam;ctx.fillRect(-radius*.48,-radius*.47,radius*.3,radius*.22);ctx.fillRect(radius*.17,-radius*.47,radius*.3,radius*.22);
 ctx.strokeStyle="#81a9b3";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-radius*.7,radius*.7);ctx.lineTo(-radius*.9,radius*1.02);ctx.moveTo(radius*.7,radius*.7);ctx.lineTo(radius*.9,radius*1.02);ctx.stroke();ctx.restore();
 if(scene.phase==="rescued"){
  for(let i=0;i<24;i++){const phase=(t*.5+i*.041)%1;const theta=i*2.4;ctx.globalAlpha=1-phase;ctx.fillStyle=i%2?C.gold:C.foam;ctx.beginPath();ctx.arc(px+Math.cos(theta)*phase*90,py+Math.sin(theta)*phase*70,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 }
 // Wind streaks communicate direction without hiding the playable silhouette.
 if(scene.level.wind&&!scene.reduced){ctx.strokeStyle="#d9fff025";ctx.lineWidth=1;for(let i=0;i<8;i++){const x=((i*131+t*scene.level.wind*40)%(width+100)+width+100)%(width+100)-50,y=height*.2+(i*37)%(height*.55);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sign(scene.level.wind)*28,y-3);ctx.stroke();}}
 const shade=ctx.createLinearGradient(0,0,0,height);shade.addColorStop(0,"#06132344");shade.addColorStop(.35,"#06132300");shade.addColorStop(1,"#06132340");ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
 return cam;
}
