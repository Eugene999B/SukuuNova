"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Save, Sparkles } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, unlockArcadeAudio } from "@/lib/arcade-audio";
import "./nova-runner-v6.css";

type RunnerQuestion = { id: string; prompt: string; options: string[] };
type RunnerLearningPlan = {
  version: 1;
  targetDifficulty: number;
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type RunnerRound = {
  id: string;
  difficulty: number;
  ageBand: string | null;
  answers: string[];
  questions: RunnerQuestion[];
  learningPlan?: RunnerLearningPlan | null;
};
type Props = { learnerName: string; round: RunnerRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type IntroPhase = "READY" | "SET" | "RUN" | "";
type Runtime = {
  last: number;
  world: number;
  playerY: number;
  jumpVelocity: number;
  distance: number;
  toGate: number;
  energy: number;
  crystals: number;
  obstacleSeed: number;
  hitWindow: boolean;
  hudAt: number;
};

const WIDTH = 960;
const HEIGHT = 540;
const GROUND = 408;
const WORLD_LABELS: Record<NonNullable<RunnerRound["learningPlan"]>["worldKey"], string> = {
  "aurora-causeway": "Aurora Causeway",
  "meteor-foundry": "Meteor Foundry",
  "prism-canyon": "Prism Canyon",
  "nova-citadel": "Nova Citadel",
};
const SUPPORT_LABELS: Record<NonNullable<RunnerRound["learningPlan"]>["supportMode"], string> = {
  guided: "Guided route",
  supported: "Supported route",
  independent: "Independent run",
  challenge: "Challenge run",
};

function token(name: string) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function firstUnanswered(answers: readonly string[]) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? answers.length : index;
}

export default function NovaRunner({ learnerName, round, onComplete, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const pausedRef = useRef(false);
  const gateRef = useRef<number | null>(null);
  const introRef = useRef<IntroPhase>("READY");
  const questionRef = useRef(firstUnanswered(round.answers));
  const completingRef = useRef(false);
  const jumpRef = useRef<() => void>(() => undefined);
  const runtimeRef = useRef<Runtime>({ last:0, world:0, playerY:0, jumpVelocity:0, distance:firstUnanswered(round.answers) * 220, toGate:760, energy:3, crystals:0, obstacleSeed:0, hitWindow:false, hudAt:0 });

  const [paused, setPaused] = useState(false);
  const [intro, setIntro] = useState<IntroPhase>("READY");
  const [gate, setGate] = useState<number | null>(null);
  const [checkpoint, setCheckpoint] = useState(firstUnanswered(round.answers));
  const [hud, setHud] = useState({ energy:3, crystals:0, distance:Math.floor(firstUnanswered(round.answers) * 220) });

  completeRef.current = onComplete;
  exitRef.current = onExit;
  pausedRef.current = paused;
  gateRef.current = gate;
  introRef.current = intro;

  const plan = round.learningPlan;
  const worldKey = plan?.worldKey ?? "aurora-causeway";
  const worldLabel = WORLD_LABELS[worldKey];
  const supportLabel = plan ? SUPPORT_LABELS[plan.supportMode] : "Adaptive route";
  const progress = useMemo(() => Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100), [checkpoint, round.questions.length]);
  const activeQuestion = gate === null ? null : round.questions[gate] ?? null;
  const bossGate = Boolean(plan?.bossGate && gate === round.questions.length - 1);

  useEffect(() => {
    answersRef.current = [...round.answers];
    questionRef.current = firstUnanswered(round.answers);
    completingRef.current = false;
    const reduced = arcadeAudioSettings().reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setCheckpoint(questionRef.current);
    if (reduced) {
      setIntro("");
      introRef.current = "";
      return;
    }
    setIntro("READY");
    introRef.current = "READY";
    const setTimer = window.setTimeout(() => { setIntro("SET"); introRef.current = "SET"; playArcadeSound("select", "math"); }, 650);
    const runTimer = window.setTimeout(() => { setIntro("RUN"); introRef.current = "RUN"; playArcadeSound("launch", "math"); }, 1250);
    const clearTimer = window.setTimeout(() => { setIntro(""); introRef.current = ""; }, 1800);
    return () => { window.clearTimeout(setTimer); window.clearTimeout(runTimer); window.clearTimeout(clearTimer); };
  }, [round.id, round.answers]);

  const chooseAnswer = (optionIndex: number) => {
    const index = gateRef.current;
    if (index === null || completingRef.current) return;
    const question = round.questions[index];
    const value = question?.options[optionIndex];
    if (!question || !value) return;
    unlockArcadeAudio();
    playArcadeSound("select", "math");
    answersRef.current[index] = value;
    const next = index + 1;
    questionRef.current = next;
    setCheckpoint(next);
    setGate(null);
    gateRef.current = null;
    const runtime = runtimeRef.current;
    runtime.energy = Math.min(3, runtime.energy + 1);
    runtime.toGate = Math.max(560, 820 - round.difficulty * 34) + Math.random() * 150;
    runtime.obstacleSeed += 1;
    runtime.hitWindow = false;
    if (next >= round.questions.length) {
      completingRef.current = true;
      playArcadeSound("success", "math");
      window.setTimeout(() => completeRef.current([...answersRef.current]), 520);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const runtime = runtimeRef.current;
    runtime.last = performance.now();
    runtime.toGate = Math.max(600, 850 - round.difficulty * 30);
    const reducedMotion = document.documentElement.dataset.arcadeMotion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = {
      canvas: token("--arcade-canvas"),
      surface: token("--arcade-surface"),
      soft: token("--arcade-surface-soft"),
      line: token("--arcade-line"),
      text: token("--arcade-text"),
      accent: token("--arcade-accent"),
      accent2: token("--arcade-accent-2"),
      danger: token("--arcade-danger"),
      warning: token("--arcade-warning"),
    };
    let raf = 0;

    const jump = () => {
      if (pausedRef.current || gateRef.current !== null || introRef.current !== "" || runtime.playerY < -2) return;
      unlockArcadeAudio();
      runtime.jumpVelocity = -620;
      playArcadeSound("select", "math");
    };
    jumpRef.current = jump;
    const pointer = () => jump();
    canvas.addEventListener("pointerdown", pointer);

    const rounded = (x:number,y:number,w:number,h:number,r:number) => {
      const rr = Math.min(r,w/2,h/2);
      ctx.beginPath();ctx.roundRect(x,y,w,h,rr);ctx.fill();
    };
    const drawWorld = (time:number) => {
      ctx.clearRect(0,0,WIDTH,HEIGHT);
      ctx.fillStyle = colors.canvas;ctx.fillRect(0,0,WIDTH,HEIGHT);
      const sky = ctx.createLinearGradient(0,0,0,HEIGHT);
      sky.addColorStop(0,colors.canvas);sky.addColorStop(1,colors.surface);ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
      if (worldKey === "meteor-foundry") {
        for(let i=0;i<7;i++){const x=((i*181-runtime.world*.18)%(WIDTH+220)+WIDTH+220)%(WIDTH+220)-80;ctx.fillStyle=i%2?colors.soft:colors.warning;ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(x,90+(i%3)*65,18+(i%4)*7,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
      } else if (worldKey === "prism-canyon") {
        ctx.globalAlpha=.22;for(let i=0;i<6;i++){const x=((i*210-runtime.world*.09)%(WIDTH+300)+WIDTH+300)%(WIDTH+300)-100;ctx.fillStyle=i%2?colors.accent:colors.accent2;ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x+80,180+(i%3)*45);ctx.lineTo(x+160,GROUND);ctx.fill();}ctx.globalAlpha=1;
      } else if (worldKey === "nova-citadel") {
        ctx.globalAlpha=.25;for(let i=0;i<8;i++){const x=((i*150-runtime.world*.12)%(WIDTH+220)+WIDTH+220)%(WIDTH+220)-70;ctx.fillStyle=colors.line;ctx.fillRect(x,170+(i%3)*36,74,GROUND-170);}ctx.globalAlpha=1;
      } else {
        ctx.globalAlpha=.2;for(let i=0;i<5;i++){const x=((i*250-runtime.world*.07)%(WIDTH+280)+WIDTH+280)%(WIDTH+280)-100;ctx.fillStyle=i%2?colors.accent:colors.accent2;ctx.beginPath();ctx.arc(x,220+(i%2)*70,80+(i%3)*22,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
      }
      for(let i=0;i<38;i++){const x=((i*137-runtime.world*.05)%(WIDTH+30)+WIDTH+30)%(WIDTH+30);const y=55+(i*73)%280;ctx.fillStyle=i%5===0?colors.accent2:colors.text;ctx.globalAlpha=i%3===0?.62:.32;ctx.fillRect(x,y,i%4===0?2:1,i%4===0?2:1);}ctx.globalAlpha=1;
      ctx.fillStyle=colors.surface;ctx.fillRect(0,GROUND,WIDTH,HEIGHT-GROUND);
      for(let i=0;i<12;i++){const x=((i*96-runtime.world)%(WIDTH+120)+WIDTH+120)%(WIDTH+120)-60;ctx.fillStyle=colors.soft;ctx.globalAlpha=.7;ctx.fillRect(x,GROUND+35,58,7);}ctx.globalAlpha=1;
      const playerX=148;const playerY=GROUND-68+runtime.playerY;const bob=reducedMotion?0:Math.sin(time*.012)*2.4;
      ctx.fillStyle=colors.accent;ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(playerX,playerY+20+bob,45,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle=colors.soft;rounded(playerX-24,playerY-8+bob,48,58,13);ctx.fillStyle=colors.accent;rounded(playerX-19,playerY-4+bob,38,20,8);ctx.fillStyle=colors.canvas;rounded(playerX-13,playerY+2+bob,8,7,3);rounded(playerX+5,playerY+2+bob,8,7,3);ctx.fillStyle=colors.accent2;ctx.beginPath();ctx.arc(playerX,playerY+31+bob,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=colors.accent;ctx.lineWidth=6;ctx.beginPath();ctx.arc(playerX-14,playerY+55+bob,8,0,Math.PI*2);ctx.arc(playerX+14,playerY+55+bob,8,0,Math.PI*2);ctx.stroke();
      const obstacleX=148+((runtime.toGate*.7+runtime.obstacleSeed*147)%470)+105;
      if(gateRef.current===null&&runtime.toGate>210&&runtime.toGate<690){ctx.fillStyle=colors.danger;ctx.globalAlpha=.86;rounded(obstacleX,GROUND-52,36,52,8);ctx.fillStyle=colors.warning;ctx.beginPath();ctx.moveTo(obstacleX,GROUND-52);ctx.lineTo(obstacleX+18,GROUND-78);ctx.lineTo(obstacleX+36,GROUND-52);ctx.fill();ctx.globalAlpha=1;}
      if(gateRef.current===null&&runtime.toGate<270){ctx.strokeStyle=colors.accent;ctx.lineWidth=6;ctx.globalAlpha=.65;ctx.strokeRect(WIDTH-128,160,78,248);ctx.globalAlpha=1;ctx.fillStyle=colors.text;ctx.font="700 15px system-ui";ctx.textAlign="center";ctx.fillText("KNOWLEDGE",WIDTH-89,145);ctx.fillText("GATE",WIDTH-89,165);}
      ctx.textAlign="left";ctx.fillStyle=colors.text;ctx.font="800 18px system-ui";ctx.fillText(`⚡ ${runtime.energy}   ✦ ${runtime.crystals}   ↗ ${Math.floor(runtime.distance)}m`,26,34);ctx.font="700 14px system-ui";ctx.fillStyle=colors.accent2;ctx.fillText(`${worldLabel.toUpperCase()} · GATE ${Math.min(questionRef.current+1,round.questions.length)}/${round.questions.length}`,26,58);
    };
    const tick = (time:number) => {
      const dt=Math.min(40,time-runtime.last)/1000;runtime.last=time;
      const active=!pausedRef.current&&gateRef.current===null&&introRef.current===""&&!completingRef.current;
      if(active){
        const speed=(230+round.difficulty*24)*(plan?.speedScale??1);
        runtime.world+=speed*dt;runtime.distance+=speed*dt*.055;runtime.toGate-=speed*dt;
        if(runtime.playerY<0||runtime.jumpVelocity<0){runtime.jumpVelocity+=1450*dt;runtime.playerY+=runtime.jumpVelocity*dt;if(runtime.playerY>0){runtime.playerY=0;runtime.jumpVelocity=0;}}
        const obstacleWindow=runtime.toGate>310&&runtime.toGate<355;
        if(obstacleWindow&&!runtime.hitWindow&&runtime.playerY>-42){runtime.hitWindow=true;runtime.energy=Math.max(0,runtime.energy-1);playArcadeSound("error","math");}
        if(!obstacleWindow&&runtime.toGate<300)runtime.hitWindow=false;
        if(runtime.toGate<=0){const index=questionRef.current;if(index<round.questions.length){setGate(index);gateRef.current=index;runtime.crystals+=1;playArcadeSound("open","math");}else if(!completingRef.current){completingRef.current=true;completeRef.current([...answersRef.current]);}}
      }
      if(time-runtime.hudAt>180){runtime.hudAt=time;setHud({energy:runtime.energy,crystals:runtime.crystals,distance:Math.floor(runtime.distance)});}
      drawWorld(time);raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(raf);canvas.removeEventListener("pointerdown",pointer);jumpRef.current=()=>undefined;};
  }, [round.id, round.difficulty, round.questions.length, plan?.speedScale, worldKey, worldLabel]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code === "Space") { event.preventDefault(); jumpRef.current(); return; }
      if (event.key.toLowerCase() === "p") { setPaused((value) => !value); return; }
      if (gateRef.current !== null && ["1","2","3","4"].includes(event.key)) chooseAnswer(Number(event.key)-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return <section className="nova-v6-shell" aria-label={`Nova Runner mission for ${learnerName}`}>
    <header className="nova-v6-hud">
      <div><span className="nova-v6-mark">N</span><div><strong>NOVA RUNNER</strong><small>{worldLabel} · {supportLabel}{plan?.bossGate ? " · Boss route" : ""}</small></div></div>
      <button type="button" onClick={() => { unlockArcadeAudio(); playArcadeSound("select","math"); setPaused((value)=>!value); }} aria-pressed={paused}>{paused?<Play size={17}/>:<Pause size={17}/>}<span>{paused?"Resume":"Pause"}</span></button>
    </header>
    <div className="nova-v6-progress"><i><b style={{width:`${progress}%`}}/></i><span>{checkpoint}/{round.questions.length} Knowledge Gates</span></div>
    <div className="nova-v6-stage-wrap">
      <canvas ref={canvasRef} className="nova-v6-canvas" aria-label="Animated Nova Runner course"/>
      {intro ? <div className="nova-v6-intro" aria-live="polite"><span>{intro}</span><strong>{intro==="READY"?worldLabel:intro==="SET"?"Knowledge Gates pause for thinking":"Go, Nova!"}</strong></div>:null}
      {paused ? <div className="nova-v6-pause"><Pause size={28}/><strong>RUN PAUSED</strong><p>Your progress is safe. No timer is running.</p><button type="button" onClick={()=>setPaused(false)}><Play size={17}/>Continue</button></div>:null}
      {activeQuestion ? <div className={`nova-v6-gate ${bossGate?"boss":""}`} role="dialog" aria-modal="true" aria-label="Knowledge Gate">
        <div className="nova-v6-gate-head"><Sparkles size={20}/><span>{bossGate?"BOSS KNOWLEDGE GATE":"KNOWLEDGE GATE"}</span><small>Take your time — the course is paused.</small></div>
        <h2>{activeQuestion.prompt}</h2>
        <div className="nova-v6-options">{activeQuestion.options.slice(0,4).map((option,index)=><button type="button" key={`${activeQuestion.id}-${index}`} onClick={()=>chooseAnswer(index)}><b>{index+1}</b><span>{option}</span></button>)}</div>
        <p>Keyboard: press 1–4 · Touch: tap an answer. There is no countdown.</p>
      </div>:null}
    </div>
    <footer className="nova-v6-footer"><div><strong>Course status</strong><span>⚡ {hud.energy} shield · ✦ {hud.crystals} crystals · {hud.distance}m</span></div><p><strong>Run:</strong> Space or tap to jump. <strong>Gate:</strong> choose 1–4. Knowledge Gates stop the action so maths gets thinking time.</p><button type="button" onClick={()=>exitRef.current([...answersRef.current])}><Save size={16}/>Save & exit</button></footer>
  </section>;
}