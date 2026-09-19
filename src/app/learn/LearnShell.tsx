"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Music2 } from "lucide-react";
import "./learn-shell.css";

type Cue="tap"|"start"|"correct"|"retry"|"complete";
const SoundContext=createContext<(cue:Cue)=>void>(()=>{});
export const useLearningSound=()=>useContext(SoundContext);
export function LearnShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [effects,setEffects]=useState(false),[music,setMusic]=useState(false),[volume,setVolume]=useState(35);
 const audio=useRef<AudioContext|null>(null),musicGain=useRef<GainNode|null>(null),lastTap=useRef(0);
 const prefs=useRef({effects:false,music:false,volume:35});
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem("sukuunova-learn-audio-v2")||"{}");setEffects(p.effects===true);setMusic(p.music===true);setVolume(typeof p.volume==="number"?Math.max(0,Math.min(70,p.volume)):35);}catch{}setLoaded(true);},[]);
 useEffect(()=>{prefs.current={effects,music,volume};if(loaded)try{localStorage.setItem("sukuunova-learn-audio-v2",JSON.stringify(prefs.current));}catch{}musicGain.current?.gain.setTargetAtTime(music?volume/100:0,audio.current?.currentTime||0,.15);},[effects,music,volume,loaded]);
 const unlock=useCallback(()=>{
  try{const C=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!C)return null;
   const ctx=audio.current??new C();audio.current=ctx;if(ctx.state==="suspended")void ctx.resume().catch(()=>{});return ctx;
  }catch{return null;}
 },[]);
 const play=useCallback((cue:Cue)=>{
  if(!prefs.current.effects||document.hidden)return;
  if(cue==="tap"&&Date.now()-lastTap.current<100)return;lastTap.current=Date.now();
  const ctx=unlock();if(!ctx)return;
  const notes:Record<Cue,number[]>={tap:[523.25],start:[392,523.25,659.25],correct:[523.25,659.25,783.99],retry:[392,349.23],complete:[523.25,659.25,783.99,1046.5]};
  notes[cue].forEach((hz,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+i*.095;oscillator.type="sine";oscillator.frequency.value=hz;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,prefs.current.volume/100*.11),at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+(cue==="tap"?.07:.25));oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(at);oscillator.stop(at+.3);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
 },[unlock]);
 useEffect(()=>{
  const onClick=(event:MouseEvent)=>{const target=event.target as Element;if(target.closest("button:not(:disabled),a,select")){if(prefs.current.effects||prefs.current.music)unlock();if(!target.closest("[data-audio-control]"))play("tap");}};
  const onVisibility=()=>{if(document.hidden)void audio.current?.suspend().catch(()=>{});};
  document.addEventListener("click",onClick);document.addEventListener("visibilitychange",onVisibility);
  return()=>{document.removeEventListener("click",onClick);document.removeEventListener("visibilitychange",onVisibility);};
 },[play,unlock]);
 useEffect(()=>{
  if(!music)return;
  let beat=0;
  const schedule=()=>{const ctx=audio.current;if(!ctx||ctx.state!=="running"||document.hidden)return;
   if(!musicGain.current){musicGain.current=ctx.createGain();musicGain.current.connect(ctx.destination);}
   musicGain.current.gain.setTargetAtTime(prefs.current.volume/100,ctx.currentTime,.15);
   const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
   chords[beat++%chords.length].forEach((hz,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),at=ctx.currentTime+i*.35;o.frequency.value=hz;o.type="sine";g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.025,at+.8);g.gain.exponentialRampToValueAtTime(.0001,at+5);o.connect(g);g.connect(musicGain.current!);o.start(at);o.stop(at+5.1);o.onended=()=>{o.disconnect();g.disconnect();};});
  };
  schedule();const timer=window.setInterval(schedule,5500);return()=>{clearInterval(timer);musicGain.current?.gain.setTargetAtTime(0,audio.current?.currentTime||0,.1);};
 },[music]);
 useEffect(()=>()=>{void audio.current?.close().catch(()=>{});audio.current=null;},[]);
 const links=[["Home","/learn"],["Practice","/learn/explore"],["Daily challenge","/learn/today"],["My progress","/learn/progress"]];
 return <SoundContext.Provider value={play}><div className="learn-frame"><a className="learn-skip" href="#learning-content">Skip to learning</a><header className="learn-global-header"><Link href="/learn" className="learn-wordmark"><span>✦</span><strong>SukuuNova <b>Learn</b></strong></Link><Link className="learn-school-link" href="/">School management ↗</Link><nav aria-label="Learning navigation">{links.map(([label,href])=><Link key={href} href={href} aria-current={pathname===href?"page":undefined}>{label}</Link>)}</nav><details className="learn-audio" data-audio-control><summary aria-label="Learning audio settings">{effects||music?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>Sound</span></summary><div className="learn-audio-panel"><strong>Set your study mood</strong><label><input type="checkbox" checked={effects} onChange={e=>{unlock();prefs.current.effects=e.target.checked;setEffects(e.target.checked);if(e.target.checked)play("correct");}}/> Interaction sounds</label><label><input type="checkbox" checked={music} onChange={e=>{unlock();setMusic(e.target.checked);}}/><Music2 size={15}/> Gentle focus music</label><label>Volume<input aria-label="Learning audio volume" type="range" min="0" max="70" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><small>Optional. Audio pauses when this tab is hidden. Tap a control to resume.</small></div></details></header><div id="learning-content">{children}</div></div></SoundContext.Provider>;
}
