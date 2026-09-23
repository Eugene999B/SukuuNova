"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Volume2, VolumeX, Maximize2, Pause, Play, RotateCcw, Map, HelpCircle, Lock, Star, Rocket, Wind, Battery, Crosshair, ChevronRight } from "lucide-react";
import { LEVELS, STEP, SAVE_KEY, launch, stepFlight, predict, flightStars, readProgress, unlockedThrough, clamp, type Flight, type Point, type Progress } from "@/lib/robot-rescue/physics";
import { drawScene, worldPoint, type Camera } from "@/lib/robot-rescue/renderer";
import { RescueAudio } from "@/lib/robot-rescue/audio";

type Phase="aiming"|"flying"|"rescued"|"missed";
type Run={angle:number;energy:number;time:number;impact:number;reason:string;rescued:boolean};
const initial=LEVELS[0];

export function RobotRescue(){
 const [index,setIndex]=useState(0),[angle,setAngle]=useState(initial.angle),[energy,setEnergy]=useState(initial.energy);
 const [mode,setMode]=useState<"explorer"|"precision">("explorer"),[phase,setPhase]=useState<Phase>("aiming");
 const [started,setStarted]=useState(false),[paused,setPaused]=useState(false),[survey,setSurvey]=useState(false),[reduced,setReduced]=useState(false);
 const [sound,setSound]=useState(true),[music,setMusic]=useState(false),[volume,setVolume]=useState(35),[audioReady,setAudioReady]=useState(false);
 const [progress,setProgress]=useState<Progress>(()=>readProgress(null)),[loaded,setLoaded]=useState(false),[saveNotice,setSaveNotice]=useState("");
 const [dialog,setDialog]=useState<"help"|"missions"|null>(null),[history,setHistory]=useState<Run[]>([]),[braking,setBraking]=useState(false);
 const [telemetry,setTelemetry]=useState<Flight>(()=>launch(initial,initial.angle,initial.energy));
 const [notice,setNotice]=useState("");
 const shellRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),dialogRef=useRef<HTMLDialogElement>(null),resultButtonRef=useRef<HTMLButtonElement>(null);
 const audioRef=useRef<RescueAudio|null>(null),flightRef=useRef(launch(initial,initial.angle,initial.energy)),brakeRef=useRef(false);
 const trailRef=useRef<Point[]>([]),ghostRef=useRef<Point[]>([]),cameraRef=useRef<Camera|null>(null),dragRef=useRef(false);
 const phaseRef=useRef<Phase>("aiming"),pauseRef=useRef(false);
 const finishRef=useRef<(flight:Flight)=>void>(()=>{});
 const actionsRef=useRef({launch:()=>{},retry:()=>{},pause:()=>{}});
 const level=LEVELS[index],unlocked=unlockedThrough(progress.best),rescuedCount=progress.best.filter(n=>n>0).length;
 const forecast=useMemo(()=>predict(level,angle,energy,mode==="explorer"),[level,angle,energy,mode]);
 const viewRef=useRef({level,index,angle,energy,phase,mode,started,survey,reduced,preview:forecast.points});
 viewRef.current={level,index,angle,energy,phase,mode,started,survey,reduced,preview:mode==="explorer"?forecast.points:forecast.points.slice(0,9)};
 phaseRef.current=phase;pauseRef.current=paused;

 function audio(){if(!audioRef.current)audioRef.current=new RescueAudio();return audioRef.current;}
 function unlockAudio(){
  const engine=audio();engine.setEnabled(sound);engine.setVolume(volume/100);engine.setMusic(music);
  void engine.unlock().then(setAudioReady);
 }
 function releaseBrake(){brakeRef.current=false;setBraking(false);}
 function resetMission(next=index){
  const destination=LEVELS[next];
  releaseBrake();setPaused(false);pauseRef.current=false;setPhase("aiming");phaseRef.current="aiming";
  flightRef.current=launch(destination,next===index?angle:destination.angle,next===index?energy:destination.energy);
  setTelemetry(flightRef.current);
  if(next!==index){setIndex(next);setAngle(destination.angle);setEnergy(destination.energy);setHistory([]);ghostRef.current=[];setSurvey(false);}
  else ghostRef.current=[...trailRef.current];
  trailRef.current=[];setNotice("");
 }
 function begin(){setStarted(true);resetMission();unlockAudio();canvasRef.current?.focus();}
 function launchPod(){
  if(phaseRef.current!=="aiming"||pauseRef.current||!started||dialog)return;
  unlockAudio();
  flightRef.current=launch(level,angle,energy);trailRef.current=[{x:4,y:flightRef.current.y}];
  phaseRef.current="flying";setPhase("flying");setTelemetry(flightRef.current);setSurvey(false);setNotice("");
  audioRef.current?.cue("launch");canvasRef.current?.focus();
 }
 function togglePause(){
  if(phaseRef.current!=="flying")return;
  const next=!pauseRef.current;pauseRef.current=next;setPaused(next);releaseBrake();
  if(next)audioRef.current?.pause();else unlockAudio();
 }
 function openDialog(which:"help"|"missions"){
  if(phaseRef.current==="flying"){pauseRef.current=true;setPaused(true);releaseBrake();audioRef.current?.pause();}
  setDialog(which);
 }
 function chooseMission(next:number){
  if(next>unlocked)return;
  setDialog(null);setStarted(true);resetMission(next);unlockAudio();audioRef.current?.cue("select");
 }
 async function fullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(shellRef.current?.requestFullscreen)await shellRef.current.requestFullscreen();else setNotice("Use your browser's full-screen option for a larger view.");}
  catch{setNotice("Full screen is unavailable here. You can still play in this window.");}
 }
 finishRef.current=(flight)=>{
  phaseRef.current=flight.status==="rescued"?"rescued":"missed";
  setPhase(phaseRef.current);setTelemetry({...flight});releaseBrake();
  setHistory(previous=>[{angle,energy,time:flight.time,impact:flight.impact,reason:flight.reason,rescued:flight.status==="rescued"},...previous].slice(0,5));
  if(flight.status==="rescued"){
   setProgress(previous=>{const best=[...previous.best];best[index]=Math.max(best[index]||0,flightStars(flight));return {...previous,best};});
   audioRef.current?.cue("success");
  }else audioRef.current?.cue("retry");
 };
 actionsRef.current={launch:launchPod,retry:()=>resetMission(),pause:togglePause};

 useEffect(()=>{
  try{
   const saved=readProgress(localStorage.getItem(SAVE_KEY));const next=unlockedThrough(saved.best);
   setProgress(saved);setMode(saved.mode);setIndex(next);setAngle(LEVELS[next].angle);setEnergy(LEVELS[next].energy);
   flightRef.current=launch(LEVELS[next],LEVELS[next].angle,LEVELS[next].energy);setTelemetry(flightRef.current);
  }catch{setSaveNotice("This browser cannot save progress. You can still play.");}
  setLoaded(true);
  const media=matchMedia("(prefers-reduced-motion: reduce)");setReduced(media.matches);
  const changed=()=>setReduced(media.matches);media.addEventListener("change",changed);
  return ()=>media.removeEventListener("change",changed);
 },[]);
 useEffect(()=>{
  if(!loaded)return;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({...progress,mode}));}
  catch{setSaveNotice("Progress could not be saved on this device. Keep this tab open to continue.");}
 },[progress,mode,loaded]);
 useEffect(()=>{
  const d=dialogRef.current;if(!d)return;
  if(dialog&&!d.open)d.showModal();
  if(!dialog&&d.open)d.close();
 },[dialog]);
 useEffect(()=>{if(phase==="rescued"||phase==="missed")resultButtonRef.current?.focus();},[phase]);
 useEffect(()=>{
  const onBlur=()=>{brakeRef.current=false;setBraking(false);if(phaseRef.current==="flying"){pauseRef.current=true;setPaused(true);}audioRef.current?.pause();};
  const onVisibility=()=>{if(document.hidden)onBlur();};
  const keys=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement;
   if(!viewRef.current.started||dialogRef.current?.open||target.matches("input,select,textarea,button,a"))return;
   const key=event.key.toLowerCase();
   if([" ","arrowleft","arrowright","arrowup","arrowdown","p","r"].includes(key))event.preventDefault();
   if(key===" "&&!event.repeat){if(phaseRef.current==="aiming")actionsRef.current.launch();else if(phaseRef.current==="flying"&&!pauseRef.current){brakeRef.current=true;setBraking(true);}}
   if(key==="p"&&!event.repeat)actionsRef.current.pause();
   if(key==="r"&&!event.repeat)actionsRef.current.retry();
   if(phaseRef.current==="aiming"){
    if(key==="arrowleft")setAngle(v=>clamp(v-1,15,75));
    if(key==="arrowright")setAngle(v=>clamp(v+1,15,75));
    if(key==="arrowup")setEnergy(v=>clamp(v+5,80,600));
    if(key==="arrowdown")setEnergy(v=>clamp(v-5,80,600));
   }
  };
  const keyUp=(event:KeyboardEvent)=>{if(event.key===" "){brakeRef.current=false;setBraking(false);}};
  window.addEventListener("keydown",keys);window.addEventListener("keyup",keyUp);window.addEventListener("blur",onBlur);document.addEventListener("visibilitychange",onVisibility);
  return ()=>{window.removeEventListener("keydown",keys);window.removeEventListener("keyup",keyUp);window.removeEventListener("blur",onBlur);document.removeEventListener("visibilitychange",onVisibility);audioRef.current?.destroy();};
 },[]);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const ctx=canvas.getContext("2d");if(!ctx){setNotice("Your browser could not start the game graphics. Try a browser with Canvas support.");return;}
  let frame=0,last=0,accumulator=0,hudClock=0,steps=0;
  const render=(now:number)=>{
   const delta=last?Math.min(.1,(now-last)/1000):0;last=now;
   const v=viewRef.current;
   if(phaseRef.current==="flying"&&!pauseRef.current){
    accumulator+=delta;
    while(accumulator>=STEP&&flightRef.current.status==="flying"){
     const previous=flightRef.current;
     flightRef.current=stepFlight(previous,v.level,brakeRef.current,v.mode==="explorer");accumulator-=STEP;steps++;
     if(steps%6===0)trailRef.current.push({x:flightRef.current.x,y:flightRef.current.y});
     if(flightRef.current.collected.length>previous.collected.length)audioRef.current?.cue("pickup");
     if(flightRef.current.status!=="flying"){trailRef.current.push({x:flightRef.current.x,y:flightRef.current.y});finishRef.current(flightRef.current);break;}
    }
    hudClock+=delta;if(hudClock>=.1){setTelemetry({...flightRef.current});hudClock=0;}
   }else accumulator=0;
   const bounds=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
   if(bounds.width>0&&bounds.height>0){
    const w=Math.round(bounds.width*dpr),h=Math.round(bounds.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    cameraRef.current=drawScene(ctx,bounds.width,bounds.height,{...v,flight:flightRef.current,phase:phaseRef.current,trail:trailRef.current,ghost:ghostRef.current,time:now/1000});
   }
   frame=requestAnimationFrame(render);
  };
  frame=requestAnimationFrame(render);return ()=>cancelAnimationFrame(frame);
 },[]);

 function aimAt(clientX:number,clientY:number){
  const canvas=canvasRef.current,camera=cameraRef.current;if(!canvas||!camera||phase!=="aiming"||!started)return;
  const bounds=canvas.getBoundingClientRect(),point=worldPoint(camera,clientX-bounds.left,clientY-bounds.top);
  const dx=point.x-4,dy=point.y-4.58;if(dx<.3||dy<.3)return;
  setAngle(Math.round(clamp(Math.atan2(dy,dx)*180/Math.PI,15,75)));
  setEnergy(Math.round(clamp(Math.hypot(dx,dy)*12,80,600)/5)*5);
 }
 const totalStars=progress.best.reduce((a,b)=>a+b,0);
 return <div ref={shellRef} className={"rr-shell"+(started?" is-playing":"")+(phase==="flying"?" is-flying":"")}>
  <header className="rr-header">
   <Link href="/" className="rr-home" aria-label="Back to SukuuNova"><ArrowLeft size={18}/><span>SukuuNova</span></Link>
   <div className="rr-wordmark"><Rocket size={18}/><strong>ROBOT RESCUE</strong><span>Signal Isles</span></div>
   <div className="rr-toolbar">
    <button type="button" onClick={()=>openDialog("missions")} aria-label="Open mission map"><Map size={19}/></button>
    <button type="button" onClick={()=>{const next=!sound;setSound(next);audio().setEnabled(next);if(next)void audio().unlock().then(setAudioReady);}} aria-label={sound?"Mute sound":"Enable sound"} aria-pressed={sound}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
    <button type="button" onClick={fullscreen} aria-label="Toggle full screen"><Maximize2 size={18}/></button>
    <button type="button" onClick={()=>openDialog("help")} aria-label="How to play and settings"><HelpCircle size={19}/></button>
   </div>
  </header>
  <main className="rr-main">
   <section className="rr-stage" aria-label="Rescue flight world">
    <canvas ref={canvasRef} tabIndex={0} data-testid="rescue-canvas" aria-label="Rescue flight scene. Use the launcher controls to reach the green landing pad. Arrow keys adjust aim and energy; Space launches or holds the brake; P pauses; R retries."
     onPointerDown={e=>{if(phase!=="aiming"||!started)return;dragRef.current=true;e.currentTarget.setPointerCapture(e.pointerId);aimAt(e.clientX,e.clientY);}}
     onPointerMove={e=>{if(dragRef.current)aimAt(e.clientX,e.clientY);}}
     onPointerUp={()=>{dragRef.current=false;}} onPointerCancel={()=>{dragRef.current=false;}}>
     Your browser needs Canvas support to display this game. All flight controls and results are also shown as text.
    </canvas>
    {started&&<div className="rr-scene-top"><div><span className="rr-kicker">MISSION {String(index+1).padStart(2,"0")} / 06</span><h1>{level.name}</h1><p>{level.region} · Rescue {level.robot}</p></div><button className={survey?"is-active":""} onClick={()=>setSurvey(v=>!v)} aria-pressed={survey}><Crosshair size={16}/>{survey?"Follow pod":"Survey island"}</button></div>}
    {started&&<div className="rr-scene-bottom"><span><Wind size={14}/>{level.wind===0?"Still air":(level.wind<0?"← ":"→ ")+Math.abs(level.wind)+" N wind push"}</span><span>{level.mass} kg pod</span><span>Safe landing ≤ 9 m/s</span><span data-testid="rescue-clock">{(phase==="aiming"?0:telemetry.time).toFixed(1)} s</span></div>}
    {!started&&<div className="rr-title-screen">
     <span className="rr-kicker">A SUKUUNOVA PHYSICS ADVENTURE</span>
     <h1>ROBOT<br/><em>RESCUE</em></h1>
     <span className="rr-title-chapter">SIGNAL ISLES · CHAPTER ONE</span>
     <p>The islands went quiet.<br/>Six little robots kept the lights on.<br/>Now it’s your turn to bring them home.</p>
     <button className="rr-primary" onClick={begin} disabled={!loaded}>{rescuedCount?"Continue rescue":"Start rescue"}<ArrowRight size={19}/></button>
     <span className="rr-title-note">Free to play · No account needed</span>
    </div>}
    {started&&paused&&phase==="flying"&&<div className="rr-overlay"><div className="rr-result"><span className="rr-kicker">FLIGHT PAUSED</span><h2>Take your time.</h2><p>Your pod is exactly where you left it.</p><button className="rr-primary" onClick={togglePause}><Play size={18}/>Resume flight</button></div></div>}
    {(phase==="rescued"||phase==="missed")&&<div className="rr-overlay rr-finish" role="region" aria-label="Flight result">
     <div className="rr-result">
      <span className="rr-kicker">{phase==="rescued"?(index===5?"THE ISLANDS ARE CONNECTED":"RESCUE COMPLETE"):"POD SAFELY RECOVERED"}</span>
      <h2>{phase==="rescued"?(index===5?"Every light is back.":level.robot+" is coming home."):"A new plan, not a dead end."}</h2>
      {phase==="rescued"&&<div className="rr-stars" aria-label={flightStars(telemetry)+" of 3 stars"}>{[1,2,3].map(n=><Star key={n} size={27} className={n<=flightStars(telemetry)?"earned":""}/>)}</div>}
      <p>{telemetry.reason}</p>
      <div className="rr-result-data"><span><b>{telemetry.time.toFixed(1)} s</b>flight time</span><span><b>{telemetry.impact.toFixed(1)} m/s</b>final speed</span><span><b>{telemetry.collected.length}/{level.orbs.length}</b>energy cells</span></div>
      <div className="rr-result-actions">
       {phase==="rescued"&&index<5?<button ref={resultButtonRef} className="rr-primary" onClick={()=>chooseMission(index+1)}>Next rescue<ArrowRight size={18}/></button>
        :<button ref={resultButtonRef} className="rr-primary" onClick={()=>{resetMission();canvasRef.current?.focus();}}><RotateCcw size={17}/>{phase==="rescued"?"Fly again":"Adjust & retry"}</button>}
       {phase==="rescued"&&index<5&&<button className="rr-secondary" onClick={()=>resetMission()}>Improve this flight</button>}
       {phase==="rescued"&&index===5&&<button className="rr-secondary" onClick={()=>openDialog("missions")}>Replay the islands</button>}
      </div>
      <details><summary>What this flight teaches</summary><p>{level.lesson}</p><p>One star for rescue, one for collecting the cell, one for landing at 5 m/s or slower.</p></details>
     </div>
    </div>}
   </section>
   <aside className="rr-console" aria-label="Flight workshop">
    <div className="rr-console-head"><span className="rr-kicker">{started?"FLIGHT WORKSHOP":"YOUR RESCUE CHAPTER"}</span><span className="rr-progress"><Star size={13}/>{totalStars}/18</span></div>
    {!started?<div className="rr-welcome">
     <h2>Small pod.<br/>Big responsibility.</h2><p>Plan a trajectory, read the wind and ease onto the landing pad. Every island asks you to think a little differently.</p>
     <div className="rr-mode-options"><button onClick={()=>setMode("explorer")} aria-pressed={mode==="explorer"}><strong>Explorer</strong><span>Flight preview + automatic landing brake. Start here.</span></button><button onClick={()=>setMode("precision")} aria-pressed={mode==="precision"}><strong>Precision</strong><span>Short aim guide. You control every braking decision.</span></button></div>
     <div className="rr-chapter-progress"><span>{rescuedCount} / 6 robots rescued</span><progress value={rescuedCount} max={6}/></div>
     <button className="rr-secondary" onClick={()=>openDialog("missions")}>View island map<ChevronRight size={16}/></button>
     <p className="rr-device-note">Progress stays in this browser. No lives, countdown pressure or paid hints.</p>
    </div>:<>
     <p className="rr-brief">{level.story}</p>
     <div className="rr-mode-switch" aria-label="Flight assistance"><button disabled={phase!=="aiming"} onClick={()=>setMode("explorer")} aria-pressed={mode==="explorer"}>Explorer</button><button disabled={phase!=="aiming"} onClick={()=>setMode("precision")} aria-pressed={mode==="precision"}>Precision</button></div>
     <div className="rr-controls">
      <label htmlFor="rescue-angle"><span>Launch angle <b>{angle}°</b></span><input id="rescue-angle" type="range" min={15} max={75} step={1} value={angle} disabled={phase!=="aiming"} onChange={e=>setAngle(Number(e.target.value))}/><small>Lower arc <span>Higher arc</span></small></label>
      <label htmlFor="rescue-energy"><span>Launch energy <b>{energy} J</b></span><input id="rescue-energy" type="range" min={80} max={600} step={5} value={energy} disabled={phase!=="aiming"} onChange={e=>setEnergy(Number(e.target.value))}/><small>Gentle <span>Powerful</span></small></label>
     </div>
     <div className="rr-telemetry" aria-label="Flight instruments">
      <div><span>{phase==="aiming"?"Launch speed":"Horizontal speed"}</span><strong>{(phase==="aiming"?Math.sqrt(2*energy/level.mass):telemetry.vx).toFixed(1)}<small> m/s</small></strong></div>
      <div><span>{phase==="aiming"?"Pod mass":"Vertical speed"}</span><strong>{phase==="aiming"?level.mass:telemetry.vy.toFixed(1)}<small>{phase==="aiming"?" kg":" m/s"}</small></strong></div>
     </div>
     {phase==="aiming"?<>
      <p className="rr-forecast">{mode==="explorer"?(forecast.state.status==="rescued"?"Preview: a safe landing is possible. Try collecting the gold cell too.":"Preview: this path needs an adjustment. Watch where the dotted line ends."):"Manual flight: hold Brake on descent. The orange line will show your previous attempt."}</p>
      <button className="rr-primary rr-launch" onClick={launchPod}><Rocket size={20}/>Launch pod<span>Space</span></button>
     </>:<div className="rr-flight-controls">
      <div className="rr-fuel"><Battery size={16}/><span>Brake fuel</span><progress max={100} value={telemetry.fuel}/><b>{Math.ceil(telemetry.fuel)}%</b></div>
      <button type="button" className={"rr-brake"+(braking?" is-active":"")} disabled={phase!=="flying"||paused||telemetry.fuel<=0}
       onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);brakeRef.current=true;setBraking(true);}}
       onPointerUp={releaseBrake} onPointerCancel={releaseBrake} onLostPointerCapture={releaseBrake}
       onKeyDown={e=>{if((e.key===" "||e.key==="Enter")&&!e.repeat){e.preventDefault();brakeRef.current=true;setBraking(true);}}}
       onKeyUp={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();releaseBrake();}}} onBlur={releaseBrake}>Hold brake <span>{mode==="explorer"?"Landing assist is also active":"Hold Space during flight"}</span></button>
      <div className="rr-flight-actions"><button onClick={togglePause} disabled={phase!=="flying"}>{paused?<Play size={16}/>:<Pause size={16}/>} {paused?"Resume":"Pause"}</button><button onClick={()=>resetMission()}><RotateCcw size={16}/>Retry</button></div>
     </div>}
     <details className="rr-hint"><summary>Briefing, hint & physics</summary><p>{level.story}</p><p>{level.hint}</p><p>{level.lesson}</p></details>
     {history.length>0&&<details className="rr-log"><summary>Flight log · {history.length} attempts</summary>{history.map((run,i)=><article key={i}><strong>{run.rescued?"Rescue":"Recovered"} · {run.angle}° · {run.energy} J</strong><p>{run.reason}</p><span>{run.time.toFixed(1)} s · {run.impact.toFixed(1)} m/s final</span></article>)}</details>}
    </>}
    <div className="rr-console-foot"><span className="rr-save-state">{saveNotice||"Progress saved on this device"}</span><span>{audioReady?(sound?"Sound ready":"Sound muted"):"Sound starts after you press play"}</span></div>
   </aside>
  </main>
  <div className="rr-status" role="status" data-testid="rescue-status">{notice||(phase==="flying"?(paused?"Flight paused":"Flight in progress"):phase==="rescued"?"Rescue complete":phase==="missed"?"Pod recovered. Adjust and retry.":started?"Ready to launch":"Choose a flight mode and start your rescue.")}</div>
  <dialog ref={dialogRef} className="rr-dialog" onCancel={()=>setDialog(null)} onClose={()=>setDialog(null)}>
   <div className="rr-dialog-head"><h2>{dialog==="missions"?"The Signal Isles":"Flight guide & settings"}</h2><button onClick={()=>setDialog(null)} aria-label="Close dialog">×</button></div>
   {dialog==="missions"?<><p>Reconnect the islands, one rescue at a time. Replay any completed mission to improve your flight.</p><div className="rr-map">{LEVELS.map((item,i)=><button key={item.id} disabled={i>unlocked} onClick={()=>chooseMission(i)}><span className="rr-map-number">{i>unlocked?<Lock size={18}/>:String(i+1).padStart(2,"0")}</span><span><strong>{item.name}</strong><small>{item.region} · {item.robot}</small></span><span className="rr-map-stars" aria-label={(progress.best[i]||0)+" stars"}>{progress.best[i]>0?"★".repeat(progress.best[i]):i<=unlocked?"→":""}</span></button>)}</div></>:<>
    <ol className="rr-guide"><li><strong>Read the island.</strong> Reach the glowing green pad. Rocks are solid; the gold cell is optional.</li><li><strong>Plan a flight.</strong> Adjust angle and launch energy using the sliders, arrow keys, or drag upward from the pod.</li><li><strong>Land gently.</strong> Hold Brake to reduce velocity. Fuel is limited. Landing at 9 m/s or less rescues the robot.</li><li><strong>Learn from the trace.</strong> Retry keeps your last flight in orange. Change one setting and compare.</li></ol>
    <p><b>Explorer:</b> full prediction and an automatic brake over the pad. <b>Precision:</b> a short guide and manual braking. Both use the same physics.</p>
    <div className="rr-settings"><label><input type="checkbox" checked={music} onChange={e=>{setMusic(e.target.checked);audio().setMusic(e.target.checked);void audio().unlock().then(setAudioReady);}}/> Gentle background music</label><label htmlFor="rescue-volume">Sound volume <b>{volume}%</b><input id="rescue-volume" type="range" min={0} max={70} value={volume} onChange={e=>{setVolume(Number(e.target.value));audio().setVolume(Number(e.target.value)/100);}}/></label></div>
    <details><summary>About the physics</summary><p>Gravity is 9.81 m/s². Launch speed comes from kinetic energy: v = √(2E/m). Wind is a steady horizontal force, and the brake adds velocity-dependent resistance. The pod uses a square collision envelope; rocks are fixed rectangles. These are deliberate game simplifications, not an engineering design tool.</p><p>Physics advances at a fixed 120 steps per second. Explorer predicts with the same simulation used by the actual flight.</p></details>
    <p className="rr-device-note">Motion follows your device’s reduced-motion preference. All sound cues have visible equivalents. Progress is local to this browser.</p>
   </>}
  </dialog>
 </div>;
}
