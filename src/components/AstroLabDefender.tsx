"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BatteryCharging, Crosshair, Gauge, LogOut, Navigation, Orbit, Radio, Shield, Wrench, Zap } from "lucide-react";
import { astroPowerReward, astroSystemDrain, astroSystemForCheckpoint, astroThreatDurationMs, type AstroSystem } from "@/lib/astrolab-mission";
import "./astrolab-defender.css";

type AstroScene = { cue?: string; meterLabels?: string[] };
type AstroQuestion = { id: string; prompt: string; options: string[]; scene?: AstroScene };
type AstroLearningPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type AstroRound = {
  id: string;
  difficulty: number;
  answers: string[];
  questions: AstroQuestion[];
  learningPlan?: AstroLearningPlan | null;
};
type Props = {
  learnerName: string;
  round: AstroRound;
  onComplete: (answers: string[]) => void;
  onExit: (answers: string[]) => void;
};
type SystemHealth = Record<AstroSystem, number>;

const WORLD_LABELS: Record<NonNullable<AstroRound["learningPlan"]>["worldKey"], string> = {
  "aurora-causeway": "Aurora Research Ring",
  "meteor-foundry": "Meteor Materials Lab",
  "prism-canyon": "Prism Physics Array",
  "nova-citadel": "Nova Citadel Laboratory",
};
const SYSTEM_LABELS: Record<AstroSystem, string> = { shields: "Shields", reactor: "Reactor", navigation: "Navigation" };

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function lowestSystem(systems: SystemHealth): AstroSystem {
  return (Object.keys(systems) as AstroSystem[]).sort((a, b) => systems[a] - systems[b])[0] ?? "shields";
}

export default function AstroLabDefender({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const deployRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(() => initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [threat, setThreat] = useState(0);
  const [systems, setSystems] = useState<SystemHealth>({ shields: 100, reactor: 100, navigation: 100 });
  const [power, setPower] = useState(2);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Scan the anomaly and choose a defence response.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const currentSystem = astroSystemForCheckpoint(checkpoint);
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const worldLabel = plan ? WORLD_LABELS[plan.worldKey] : "Nova Research Station";
  const duration = useMemo(() => astroThreatDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [round.difficulty, plan?.speedScale, plan?.supportMode]);
  const missionIntegrity = Math.round((systems.shields + systems.reactor + systems.navigation) / 3);
  const missionProgress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);

  useEffect(() => {
    startedRef.current = Date.now();
    setThreat(0);
    setSelected(0);
    if (checkpoint < round.questions.length) setMessage(boss ? "Boss anomaly detected. Stabilise the final system." : `Protect ${SYSTEM_LABELS[currentSystem].toLowerCase()} and resolve the science signal.`);
  }, [checkpoint, currentSystem, boss, round.questions.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 450);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      setThreat(Math.min(100, (elapsed / duration) * 100));
    }, 90);
    return () => window.clearInterval(timer);
  }, [checkpoint, duration, round.questions.length]);

  const deploy = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    const drain = astroSystemDrain(threat, plan?.hazardDensity ?? 0.9, boss);
    const reward = astroPowerReward(threat);
    answersRef.current[checkpoint] = answer;
    setSystems((value) => ({ ...value, [currentSystem]: Math.max(20, value[currentSystem] - drain) }));
    setPower((value) => Math.min(9, value + reward));
    setPulse(true);
    setMessage(`Response transmitted. ${SYSTEM_LABELS[currentSystem]} telemetry recorded.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 520);
  };
  deployRef.current = deploy;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (round.questions[checkpoint]?.options.length ?? 0)) setSelected(index);
      } else if (event.key === "Enter") {
        event.preventDefault();
        deployRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [checkpoint, round.questions]);

  const repair = (system: AstroSystem) => {
    if (power < 1 || systems[system] >= 100 || pulse) return;
    setPower((value) => Math.max(0, value - 1));
    setSystems((value) => ({ ...value, [system]: Math.min(100, value[system] + 12) }));
    setMessage(`One power cell transferred to ${SYSTEM_LABELS[system].toLowerCase()}.`);
  };

  const autoRepair = () => repair(lowestSystem(systems));

  return <section className="astro-shell" aria-label={`AstroLab Defender mission for ${learnerName}`}>
    <header className="astro-bar">
      <div className="astro-brand"><span><Orbit size={22}/></span><div><strong>ASTROLAB DEFENDER</strong><small>{worldLabel} · {plan?.supportMode ?? "adaptive"} science mission</small></div></div>
      <button type="button" className="astro-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="astro-hud">
      <div><Shield size={16}/><strong>{missionIntegrity}%</strong><span>lab integrity</span></div>
      <div><BatteryCharging size={16}/><strong>{power}</strong><span>power cells</span></div>
      <div><Gauge size={16}/><strong>{Math.round(threat)}%</strong><span>anomaly load</span></div>
      <div><Crosshair size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>signals resolved</span></div>
    </div>

    <div className={`astro-stage ${pulse ? "pulse" : ""}`}>
      <div className="astro-space" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div>
      <div className="astro-station">
        <div className="astro-core"><span>{boss ? "BOSS" : "LAB"}</span><b>{Math.round(threat)}</b><small>THREAT</small></div>
        {(Object.keys(systems) as AstroSystem[]).map((system, index) => <div className={`astro-module module-${index + 1} ${system === currentSystem && question ? "active" : ""}`} key={system}>
          {system === "shields" ? <Shield size={20}/> : system === "reactor" ? <Zap size={20}/> : <Navigation size={20}/>}<span>{SYSTEM_LABELS[system]}</span><b>{systems[system]}%</b>
        </div>)}
        <div className="astro-beam"><i style={{ width: `${threat}%` }}/></div>
      </div>

      {question ? <div className="astro-console">
        <div className="astro-console-head"><div><span>{boss ? "FINAL BOSS SIGNAL" : `ANOMALY ${checkpoint + 1} / ${round.questions.length}`}</span><strong>{SYSTEM_LABELS[currentSystem]} under load</strong></div><Radio size={22}/></div>
        {question.scene?.cue ? <p className="astro-cue">{question.scene.cue}</p> : null}
        {question.scene?.meterLabels?.length ? <div className="astro-meters">{question.scene.meterLabels.map((meter) => <span key={meter}>{meter}</span>)}</div> : null}
        <h2>{question.prompt}</h2>
        <div className="astro-options">{question.options.slice(0, 4).map((option, index) => <button type="button" className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={`${index}-${option}`} disabled={pulse}><b>{index + 1}</b><span>{option}</span></button>)}</div>
        <button type="button" className="astro-deploy" onClick={deploy} disabled={pulse}><Crosshair size={17}/>{pulse ? "Transmitting…" : "Deploy response"}</button>
        <div className="astro-status"><span>{message}</span><small>Keys 1–4 select · Enter deploys</small></div>
      </div> : <div className="astro-console astro-finished"><Shield size={38}/><strong>LAB SECURED</strong><span>Uploading mission telemetry for scientific review…</span></div>}
    </div>

    <div className="astro-repair-bar"><div><Wrench size={16}/><span>Power transfer</span><small>Use earned cells to reinforce systems. Academic correctness is graded securely after the mission.</small></div><div className="astro-repair-actions"><button type="button" onClick={autoRepair} disabled={power < 1 || pulse}>Repair lowest</button>{(Object.keys(systems) as AstroSystem[]).map((system) => <button type="button" key={system} onClick={() => repair(system)} disabled={power < 1 || systems[system] >= 100 || pulse}>{SYSTEM_LABELS[system]}</button>)}</div></div>
    <footer className="astro-footer"><span>Mission progress {missionProgress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Learning profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span></footer>
  </section>;
}
