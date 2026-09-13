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
type ProbePoint = { x: number; y: number };

const WORLD_LABELS: Record<NonNullable<AstroRound["learningPlan"]>["worldKey"], string> = {
  "aurora-causeway": "Aurora Research Ring",
  "meteor-foundry": "Meteor Materials Lab",
  "prism-canyon": "Prism Physics Array",
  "nova-citadel": "Nova Citadel Laboratory",
};
const SYSTEM_LABELS: Record<AstroSystem, string> = { shields: "Shields", reactor: "Reactor", navigation: "Navigation" };
const SIGNAL_POINTS: ProbePoint[] = [
  { x: 22, y: 25 },
  { x: 76, y: 24 },
  { x: 30, y: 72 },
  { x: 73, y: 70 },
];
const START_POINT: ProbePoint = { x: 50, y: 49 };

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function lowestSystem(systems: SystemHealth): AstroSystem {
  return (Object.keys(systems) as AstroSystem[]).sort((a, b) => systems[a] - systems[b])[0] ?? "shields";
}

function distance(a: ProbePoint, b: ProbePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number) {
  return Math.max(6, Math.min(94, value));
}

export default function AstroLabDefender({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const deployRef = useRef<() => void>(() => undefined);
  const moveRef = useRef<(dx: number, dy: number) => void>(() => undefined);
  const lockRef = useRef<(index: number) => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(() => initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState<number | null>(null);
  const [probe, setProbe] = useState<ProbePoint>(START_POINT);
  const [threat, setThreat] = useState(0);
  const [systems, setSystems] = useState<SystemHealth>({ shields: 100, reactor: 100, navigation: 100 });
  const [power, setPower] = useState(2);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Pilot the research probe to a signal, lock it, then transmit your science response.");
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
  const moveStep = plan?.supportMode === "guided" ? 12 : plan?.supportMode === "challenge" ? 7 : 9;
  const lockRadius = plan?.supportMode === "guided" ? 20 : plan?.supportMode === "supported" ? 17 : 14;

  useEffect(() => {
    startedRef.current = Date.now();
    setThreat(0);
    setSelected(null);
    setProbe(START_POINT);
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "Boss anomaly detected. Fly to a signal beacon and stabilise the final system." : `Probe released. Navigate toward the science signal that best protects ${SYSTEM_LABELS[currentSystem].toLowerCase()}.`);
    }
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

  const lockSignal = (index: number) => {
    if (!question || pulse || index >= question.options.length) return;
    const point = SIGNAL_POINTS[index] ?? START_POINT;
    setProbe(point);
    setSelected(index);
    setMessage(`Signal ${index + 1} locked. Review the evidence, or keep piloting before you transmit.`);
  };
  lockRef.current = lockSignal;

  const moveProbe = (dx: number, dy: number) => {
    if (!question || pulse) return;
    setProbe((current) => {
      const next = { x: clamp(current.x + dx), y: clamp(current.y + dy) };
      let nearest: number | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      question.options.slice(0, 4).forEach((_, index) => {
        const point = SIGNAL_POINTS[index];
        if (!point) return;
        const gap = distance(next, point);
        if (gap < nearestDistance) {
          nearestDistance = gap;
          nearest = index;
        }
      });
      if (nearest !== null && nearestDistance <= lockRadius) {
        setSelected(nearest);
        setMessage(`Probe lock acquired on signal ${nearest + 1}. Press Enter to transmit, or fly away to inspect another signal.`);
      } else {
        setSelected(null);
        setMessage("Probe in transit. Move into a signal ring to establish a research lock.");
      }
      return next;
    });
  };
  moveRef.current = moveProbe;

  const deploy = () => {
    if (!question || selected === null || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    const drain = astroSystemDrain(threat, plan?.hazardDensity ?? 0.9, boss);
    const reward = astroPowerReward(threat);
    answersRef.current[checkpoint] = answer;
    setSystems((value) => ({ ...value, [currentSystem]: Math.max(20, value[currentSystem] - drain) }));
    setPower((value) => Math.min(9, value + reward));
    setPulse(true);
    setMessage(`Signal ${selected + 1} transmitted. ${SYSTEM_LABELS[currentSystem]} telemetry sealed for secure review.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 560);
  };
  deployRef.current = deploy;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) lockRef.current(index);
      } else if (event.key === "ArrowUp" || key === "w") {
        event.preventDefault();
        moveRef.current(0, -moveStep);
      } else if (event.key === "ArrowDown" || key === "s") {
        event.preventDefault();
        moveRef.current(0, moveStep);
      } else if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        moveRef.current(-moveStep, 0);
      } else if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        moveRef.current(moveStep, 0);
      } else if (event.key === "Enter") {
        event.preventDefault();
        deployRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [moveStep, question?.options.length]);

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

      {question ? <div className="astro-console astro-flight-console">
        <div className="astro-console-head"><div><span>{boss ? "FINAL BOSS SIGNAL" : `ANOMALY ${checkpoint + 1} / ${round.questions.length}`}</span><strong>{SYSTEM_LABELS[currentSystem]} research flight</strong></div><Radio size={22}/></div>
        <div className="astro-mission-grid">
          <div className="astro-briefing">
            {question.scene?.cue ? <p className="astro-cue">{question.scene.cue}</p> : null}
            {question.scene?.meterLabels?.length ? <div className="astro-meters">{question.scene.meterLabels.map((meter) => <span key={meter}>{meter}</span>)}</div> : null}
            <h2>{question.prompt}</h2>
            <p className="astro-flight-help">Pilot the probe into an orbital signal ring. The signal you lock becomes your scientific response.</p>
            <div className="astro-flight-controls" aria-label="Probe movement controls">
              <button type="button" onClick={() => moveProbe(0, -moveStep)} disabled={pulse} aria-label="Move probe up">↑</button>
              <button type="button" onClick={() => moveProbe(-moveStep, 0)} disabled={pulse} aria-label="Move probe left">←</button>
              <button type="button" onClick={() => moveProbe(0, moveStep)} disabled={pulse} aria-label="Move probe down">↓</button>
              <button type="button" onClick={() => moveProbe(moveStep, 0)} disabled={pulse} aria-label="Move probe right">→</button>
            </div>
            <div className="astro-status" aria-live="polite"><span>{message}</span><small>WASD / arrows fly · 1–4 quick-lock · Enter transmit</small></div>
          </div>

          <div className="astro-orbit-field" role="group" aria-label="Orbital science signals">
            <div className="astro-orbit-ring ring-one" aria-hidden="true"/><div className="astro-orbit-ring ring-two" aria-hidden="true"/>
            <div className="astro-field-core" aria-hidden="true"><Orbit size={24}/><span>{SYSTEM_LABELS[currentSystem]}</span></div>
            {question.options.slice(0, 4).map((option, index) => {
              const point = SIGNAL_POINTS[index] ?? START_POINT;
              const active = selected === index;
              return <button type="button" key={`${index}-${option}`} className={`astro-signal ${active ? "locked" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => lockSignal(index)} disabled={pulse} aria-pressed={active}>
                <b>{index + 1}</b><span>{option}</span><small>{active ? "LOCKED" : "SIGNAL"}</small>
              </button>;
            })}
            <div className={`astro-probe ${selected !== null ? "has-lock" : ""}`} style={{ left: `${probe.x}%`, top: `${probe.y}%` }} aria-hidden="true"><Navigation size={22}/><i/></div>
          </div>
        </div>
        <button type="button" className="astro-deploy" onClick={deploy} disabled={pulse || selected === null}><Crosshair size={17}/>{pulse ? "Transmitting…" : selected === null ? "Acquire a signal lock" : `Transmit signal ${selected + 1}`}</button>
      </div> : <div className="astro-console astro-finished"><Shield size={38}/><strong>LAB SECURED</strong><span>Uploading mission telemetry for scientific review…</span></div>}
    </div>

    <div className="astro-repair-bar"><div><Wrench size={16}/><span>Power transfer</span><small>Use earned cells to reinforce systems. Academic correctness is graded securely after the mission.</small></div><div className="astro-repair-actions"><button type="button" onClick={autoRepair} disabled={power < 1 || pulse}>Repair lowest</button>{(Object.keys(systems) as AstroSystem[]).map((system) => <button type="button" key={system} onClick={() => repair(system)} disabled={power < 1 || systems[system] >= 100 || pulse}>{SYSTEM_LABELS[system]}</button>)}</div></div>
    <footer className="astro-footer"><span>Mission progress {missionProgress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Learning profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>Flight assist: {plan?.supportMode ?? "adaptive"}</span></footer>
  </section>;
}
