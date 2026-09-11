"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Clock, KeyRound, Lock, LogOut, Mail, ScanLine, Server, Shield, Wifi } from "lucide-react";
import { signalBreachDamage, signalChainGain, signalIncidentDurationMs, signalIntegrityReward, signalIntelReward, signalQuarantineCost, signalScannerRecovery } from "@/lib/signal-shield";
import type { SignalShieldMission, SignalShieldScene } from "@/lib/signal-shield-content";
import "./signal-shield.css";

type SignalQuestion = { id: string; prompt: string; options: string[]; scene?: unknown };
type SignalPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type SignalRound = { id: string; difficulty: number; answers: string[]; questions: SignalQuestion[]; learningPlan?: SignalPlan | null };
type Props = { learnerName: string; round: SignalRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };

const missionLabels: Record<SignalShieldMission, string> = {
  phishing: "MESSAGE TRIAGE",
  link: "LINK INSPECTION",
  password: "ACCESS CONTROL",
  privacy: "PRIVACY WATCH",
  wifi: "NETWORK CHECK",
  update: "PATCH CONTROL",
  recovery: "ACCOUNT RECOVERY",
  imposter: "IDENTITY CHECK",
};

const missionIcons: Record<SignalShieldMission, typeof Shield> = {
  phishing: Mail,
  link: ScanLine,
  password: KeyRound,
  privacy: Lock,
  wifi: Wifi,
  update: Server,
  recovery: Shield,
  imposter: AlertTriangle,
};

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function SignalShield({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const resolveRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [selected, setSelected] = useState(0);
  const [threatPressure, setThreatPressure] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [intel, setIntel] = useState(12);
  const [quarantine, setQuarantine] = useState(0);
  const [scanners, setScanners] = useState(2);
  const [chain, setChain] = useState(0);
  const [scanActive, setScanActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("CyberOps is online. Inspect each incident, protect the school network and seal a safe response for review.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const scene = (question?.scene ?? {}) as Partial<SignalShieldScene>;
  const mission = (scene.incidentType ?? "phishing") as SignalShieldMission;
  const MissionIcon = missionIcons[mission];
  const threatLevel = Math.max(1, Math.min(5, Number(scene.threatLevel ?? round.difficulty)));
  const signals = Array.isArray(scene.signalTags) ? scene.signalTags.slice(0, 3) : [];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(
    () => signalIncidentDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"),
    [round.difficulty, plan?.speedScale, plan?.supportMode],
  );
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const cue = scene.cue || "Check identity, urgency, destination, requested data and whether the action is actually necessary.";

  useEffect(() => {
    startedRef.current = Date.now();
    setThreatPressure(0);
    setSelected(0);
    setScanActive(false);
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "FINAL BREACH DRILL: the last incident is hitting the network. Read every signal before you seal the response." : `Incident ${checkpoint + 1} entered the queue. Inspect the signal and choose the safest response.`);
    }
  }, [boss, checkpoint, round.questions.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 460);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      if (elapsed >= duration) {
        const damage = signalBreachDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setIntegrity((value) => Math.max(22, value - damage));
        setChain(0);
        startedRef.current = Date.now() - Math.round(duration * 0.5);
        setThreatPressure(50);
        setMessage(`Threat pressure spiked. Firewall integrity absorbed ${damage}% load — inspect the incident and contain it.`);
      } else {
        setThreatPressure(Math.min(100, (elapsed / duration) * 100));
      }
    }, 110);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length]);

  const scanIncident = () => {
    if (!question || scanners < 1 || pulse) return;
    setScanners((value) => Math.max(0, value - 1));
    setThreatPressure((current) => {
      const next = signalScannerRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setScanActive(true);
    const clues = signals.length ? signals.join(" · ") : cue;
    setMessage(`Signal scan: ${clues}. The scanner highlights evidence but never reveals which response is graded correct.`);
  };
  scanRef.current = scanIncident;

  const resolveIncident = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const integrityGain = signalIntegrityReward(threatPressure, round.difficulty);
    const intelGain = signalIntelReward(threatLevel, threatPressure);
    const chainGain = signalChainGain(threatPressure);
    const quarantineCost = signalQuarantineCost(threatLevel, round.difficulty);
    setIntegrity((value) => Math.min(100, value + integrityGain));
    setIntel((value) => Math.min(999, value + intelGain));
    setQuarantine((value) => Math.min(99, value + 1));
    setChain((value) => Math.min(99, value + chainGain));
    if (threatPressure <= 42) setScanners((value) => Math.min(5, value + 1));
    setPulse(true);
    setMessage(`Response sealed for secure review. +${intelGain} threat intel · containment cost ${quarantineCost} · ${chainGain ? `defence chain +${chainGain}` : "incident contained"}.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 620);
  };
  resolveRef.current = resolveIncident;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) setSelected(index);
      } else if (key === "s") scanRef.current();
      else if (event.key === "Enter") {
        event.preventDefault();
        resolveRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const pressureNodes = Math.max(1, Math.min(5, 1 + Math.floor(threatPressure / 22)));

  return <section className="signal-shield-shell" aria-label={`Signal Shield CyberOps for ${learnerName}`}>
    <header className="signal-shield-bar">
      <div className="signal-shield-brand"><span><Shield size={22}/></span><div><strong>SIGNAL SHIELD</strong><small>adaptive cyber safety · digital citizenship · live incident defence</small></div></div>
      <button type="button" className="signal-shield-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="signal-shield-hud">
      <div><Shield size={16}/><strong>{integrity}%</strong><span>firewall integrity</span></div>
      <div><Activity size={16}/><strong>{intel}</strong><span>threat intel</span></div>
      <div><Lock size={16}/><strong>{quarantine}</strong><span>contained</span></div>
      <div><KeyRound size={16}/><strong>x{Math.max(1, chain)}</strong><span>defence chain</span></div>
    </div>

    <div className={`signal-shield-stage ${pulse ? "pulse" : ""}`}>
      <div className="signal-shield-world">
        <div className="signal-grid"/>
        <div className="signal-command"><Shield size={34}/><strong>SUKUUNOVA CYBEROPS</strong><span>{boss ? "FINAL BREACH DRILL" : "SCHOOL NETWORK ONLINE"}</span></div>
        <div className="signal-network" aria-label={`${pressureNodes} active threat indicators`}>
          <div className="signal-node core"><Server size={25}/><span>CORE</span></div>
          <div className="signal-node mail"><Mail size={20}/><span>MAIL</span></div>
          <div className="signal-node wifi"><Wifi size={20}/><span>WI-FI</span></div>
          <div className="signal-node vault"><Lock size={20}/><span>VAULT</span></div>
          <div className="signal-link one"/><div className="signal-link two"/><div className="signal-link three"/>
          {Array.from({ length: pressureNodes }, (_, index) => <i key={index} className={`signal-threat threat-${index + 1}`}><AlertTriangle size={13}/></i>)}
        </div>
        <div className="signal-operator"><div><span>{learnerName.trim()?.[0]?.toUpperCase() || "N"}</span></div><strong>SHIELD OPERATOR</strong></div>
        <div className="signal-terminal"><small>LIVE PACKET</small><strong>{scene.packetId || `N-${checkpoint + 1}`}</strong><span>{scene.source || "Unknown source"} · {scene.channel || "network"}</span></div>
      </div>

      {question ? <div className="signal-shield-console">
        <div className="signal-console-head"><div><span>{boss ? "FINAL INCIDENT · BREACH DRILL" : `${missionLabels[mission]} · INCIDENT ${checkpoint + 1}/${round.questions.length}`}</span><strong>{cue}</strong></div><MissionIcon size={24}/></div>
        <h2>{question.prompt}</h2>
        <div className="signal-casefile"><div><span>Source</span><strong>{scene.source || "Unknown"}</strong></div><div><span>Asset</span><strong>{scene.asset || "School network"}</strong></div><div><span>Threat</span><strong>{threatLevel}/5</strong></div></div>
        <div className="signal-options">{question.options.slice(0, 4).map((option, index) => <button type="button" key={`${index}-${option}`} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} disabled={pulse}><b>{index + 1}</b><span>{option}</span></button>)}</div>
        {scanActive ? <div className="signal-scan"><ScanLine size={15}/><span>Scanner evidence: {signals.length ? signals.join(" · ") : cue}</span></div> : null}
        <div className="signal-actions"><button type="button" className="signal-resolve" onClick={resolveIncident} disabled={pulse}><Shield size={16}/>{pulse ? "Sealing response…" : "Contain incident"}</button><button type="button" className="signal-scan-button" onClick={scanIncident} disabled={scanners < 1 || pulse}><ScanLine size={16}/>Signal scan · {scanners}</button></div>
        <div className="signal-status" aria-live="polite"><span>{message}</span><small>1–4 response · S scan · Enter contain</small></div>
      </div> : <div className="signal-shield-console signal-finished"><Shield size={48}/><strong>NETWORK STABLE · REVIEW READY</strong><span>Uploading sealed incident responses for authoritative cyber-safety grading…</span></div>}

      <div className="signal-pressure"><span><Clock size={13}/> Threat pressure</span><i><b style={{ width: `${threatPressure}%` }}/></i><strong>{Math.round(threatPressure)}%</strong></div>
    </div>

    <footer className="signal-shield-footer"><span>CyberOps progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Safety profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
