"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Brain, Clock, Heart, LogOut, Microscope, ScanLine, Shield, Sparkles, Wind, Zap } from "lucide-react";
import { bioCaseDurationMs, bioComboGain, bioInsightReward, bioScanRecovery, bioStrainDamage, bioSystemGain, bioVitalityReward } from "@/lib/bioquest";
import type { BioQuestScene, BioQuestSystem } from "@/lib/bioquest-content";
import "./bioquest-human-systems.css";

type BioQuestion = { id: string; prompt: string; options: string[]; scene?: unknown };
type BioPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type BioRound = { id: string; difficulty: number; answers: string[]; questions: BioQuestion[]; learningPlan?: BioPlan | null };
type Props = { learnerName: string; round: BioRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type BodyZone = "control" | "chest" | "core" | "motion";

const labels: Record<BioQuestSystem, string> = {
  circulatory: "CIRCULATION", respiratory: "RESPIRATION", digestive: "DIGESTION", nervous: "NEURAL CONTROL", skeletal: "SKELETAL", muscular: "MOVEMENT", immune: "DEFENCE", excretory: "FLUID BALANCE", endocrine: "HORMONE CONTROL", coordination: "SYSTEMS SYNC",
};
const zoneLabels: Record<BodyZone, string> = {
  control: "CONTROL CENTRE",
  chest: "CHEST & TRANSPORT",
  core: "CORE PROCESSING",
  motion: "FRAME & MOVEMENT",
};
const systemZone: Record<BioQuestSystem, BodyZone> = {
  circulatory: "chest",
  respiratory: "chest",
  digestive: "core",
  nervous: "control",
  skeletal: "motion",
  muscular: "motion",
  immune: "chest",
  excretory: "core",
  endocrine: "control",
  coordination: "control",
};
const zones: BodyZone[] = ["control", "chest", "core", "motion"];

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function BioQuestHumanSystems({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const commitRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const routeRef = useRef<(zone: BodyZone) => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState<number | null>(null);
  const [routedZone, setRoutedZone] = useState<BodyZone | null>(null);
  const [routeLocked, setRouteLocked] = useState(false);
  const [strain, setStrain] = useState(0);
  const [vitality, setVitality] = useState(82);
  const [oxygen, setOxygen] = useState(76);
  const [signal, setSignal] = useState(74);
  const [energy, setEnergy] = useState(72);
  const [insight, setInsight] = useState(6);
  const [scans, setScans] = useState(2);
  const [combo, setCombo] = useState(0);
  const [scanActive, setScanActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Load a biological protocol, route it through the virtual body, and stabilise the correct system.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const scene = (question?.scene ?? {}) as Partial<BioQuestScene>;
  const system = (scene.bodySystem ?? "circulatory") as BioQuestSystem;
  const targetZone = systemZone[system];
  const strainLevel = Math.max(1, Math.min(5, Number(scene.strainLevel ?? round.difficulty)));
  const signals = Array.isArray(scene.scanSignals) ? scene.scanSignals.slice(0, 3) : [];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(() => bioCaseDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [plan?.speedScale, plan?.supportMode, round.difficulty]);
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const cue = scene.cue || "Trace the organ, its system and the function that best explains the evidence.";

  useEffect(() => {
    startedRef.current = Date.now();
    setStrain(0);
    setSelected(null);
    setRoutedZone(null);
    setRouteLocked(false);
    setScanActive(false);
    if (checkpoint < round.questions.length) setMessage(boss ? "FINAL SYSTEMS SYNC: load the final protocol and route it through the correct body network." : `Case ${checkpoint + 1} entered ${scene.bay || "BioLab"}. Choose a protocol, then route it through the body.`);
  }, [boss, checkpoint, round.questions.length, scene.bay]);

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
        const damage = bioStrainDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setVitality((value) => Math.max(24, value - damage));
        if (system === "respiratory" || system === "circulatory") setOxygen((value) => Math.max(28, value - Math.ceil(damage / 2)));
        if (system === "nervous" || system === "endocrine" || system === "coordination") setSignal((value) => Math.max(28, value - Math.ceil(damage / 2)));
        if (system === "digestive" || system === "muscular" || system === "excretory") setEnergy((value) => Math.max(28, value - Math.ceil(damage / 2)));
        setCombo(0);
        startedRef.current = Date.now() - Math.round(duration * 0.5);
        setStrain(50);
        setMessage(`System strain increased. The training avatar absorbed ${damage}% impact — inspect the evidence and complete the biological route.`);
      } else setStrain(Math.min(100, (elapsed / duration) * 100));
    }, 120);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length, system]);

  const chooseProtocol = (index: number) => {
    if (!question || pulse || index >= question.options.length) return;
    setSelected(index);
    setRoutedZone(null);
    setRouteLocked(false);
    setMessage(`Protocol ${index + 1} loaded. Now route it to the body region controlled by ${labels[system].toLowerCase()}.`);
  };

  const routeProtocol = (zone: BodyZone) => {
    if (!question || pulse) return;
    if (selected === null) {
      setMessage("Load one biological protocol first, then choose its body route.");
      return;
    }
    setRoutedZone(zone);
    if (zone === targetZone) {
      setRouteLocked(true);
      setMessage(`${zoneLabels[zone]} route locked. The protocol has reached the correct system network; stabilise when ready.`);
      return;
    }
    setRouteLocked(false);
    setVitality((value) => Math.max(24, value - 2));
    setCombo(0);
    setMessage(`${zoneLabels[zone]} does not match this case pathway. Vitality -2. Trace where ${labels[system].toLowerCase()} acts and reroute.`);
  };
  routeRef.current = routeProtocol;

  const scanCase = () => {
    if (!question || scans < 1 || pulse) return;
    setScans((value) => Math.max(0, value - 1));
    setStrain((current) => {
      const next = bioScanRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setScanActive(true);
    setMessage(`BioScan evidence: ${signals.length ? signals.join(" · ") : cue}. The scan organises biological clues but never reveals the graded protocol.`);
  };
  scanRef.current = scanCase;

  const commitCase = () => {
    if (!question || selected === null || !routeLocked || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const vitalityGain = bioVitalityReward(strain, round.difficulty);
    const insightGain = bioInsightReward(strainLevel, strain);
    const systemGain = bioSystemGain(strainLevel, strain);
    const comboGain = bioComboGain(strain);
    setVitality((value) => Math.min(100, value + vitalityGain));
    setInsight((value) => Math.min(999, value + insightGain));
    setCombo((value) => Math.min(99, value + comboGain));
    if (system === "circulatory" || system === "respiratory" || system === "immune") setOxygen((value) => Math.min(100, value + systemGain));
    if (system === "nervous" || system === "endocrine" || system === "coordination") setSignal((value) => Math.min(100, value + systemGain));
    if (system === "digestive" || system === "muscular" || system === "skeletal" || system === "excretory") setEnergy((value) => Math.min(100, value + systemGain));
    if (strain <= 42) setScans((value) => Math.min(5, value + 1));
    setPulse(true);
    setMessage(`Routed protocol sealed for secure review. +${insightGain} Bio Insight · vitality +${vitalityGain} · ${comboGain ? `systems chain +${comboGain}` : "case stabilised"}.`);
    window.setTimeout(() => { setPulse(false); setCheckpoint((value) => value + 1); }, 620);
  };
  commitRef.current = commitCase;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) chooseProtocol(index);
      } else if (event.key >= "5" && event.key <= "8") {
        const zone = zones[Number(event.key) - 5];
        if (zone) routeRef.current(zone);
      } else if (key === "b") scanRef.current();
      else if (event.key === "Enter") { event.preventDefault(); commitRef.current(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const ZoneIcon = ({ zone }: { zone: BodyZone }) => zone === "control" ? <Brain size={18}/> : zone === "chest" ? <Heart size={18}/> : zone === "core" ? <Activity size={18}/> : <Zap size={18}/>;

  return <section className="bioquest-shell" aria-label={`BioQuest Human Systems for ${learnerName}`}>
    <header className="bioquest-bar"><div className="bioquest-brand"><span><Microscope size={22}/></span><div><strong>BIOQUEST · HUMAN SYSTEMS</strong><small>adaptive anatomy lab · system coordination · secure biological reasoning</small></div></div><button type="button" className="bioquest-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="bioquest-hud"><div><Heart size={16}/><strong>{vitality}%</strong><span>vitality</span></div><div><Wind size={16}/><strong>{oxygen}%</strong><span>oxygen</span></div><div><Brain size={16}/><strong>{signal}%</strong><span>signals</span></div><div><Zap size={16}/><strong>{energy}%</strong><span>energy</span></div></div>

    <div className={`bioquest-stage ${pulse ? "pulse" : ""}`}>
      <div className="bioquest-bodylab">
        <div className="bioquest-grid" aria-hidden="true"/>
        <div className={`bio-avatar ${routeLocked ? "route-locked" : ""}`}><div className="bio-head"/><div className="bio-torso"><span className="bio-heart"><Heart size={25}/></span><span className="bio-lung left"><Wind size={20}/></span><span className="bio-lung right"><Wind size={20}/></span><span className="bio-core"><Activity size={22}/></span></div><div className="bio-arm left"/><div className="bio-arm right"/><div className="bio-leg left"/><div className="bio-leg right"/></div>
        <div className="bio-route-title"><small>BODY ROUTING BOARD</small><strong>{selected === null ? "LOAD A PROTOCOL" : `PROTOCOL ${selected + 1} LOADED`}</strong></div>
        <div className="bio-route-zones" role="group" aria-label="Route protocol to a body region">{zones.map((zone, index) => {
          const attempted = routedZone === zone;
          const locked = attempted && routeLocked;
          const wrong = attempted && !routeLocked;
          return <button type="button" key={zone} className={`${zone} ${locked ? "locked" : ""} ${wrong ? "wrong" : ""}`.trim()} onClick={() => routeProtocol(zone)} disabled={!question || pulse} aria-pressed={attempted}>
            <ZoneIcon zone={zone}/><span>{zoneLabels[zone]}</span><b>{index + 5}</b>
          </button>;
        })}</div>
        <div className="bio-case-id"><small>TRAINING CASE</small><strong>{scene.caseId || `BIO-${checkpoint + 1}`}</strong><span>{scene.caseTitle || "Human systems"}</span></div>
      </div>

      {question ? <div className="bioquest-console">
        <div className="bio-console-head"><div><span>{boss ? "FINAL CASE · SYSTEMS SYNC" : `${labels[system]} · CASE ${checkpoint + 1}/${round.questions.length}`}</span><strong>{cue}</strong></div><Sparkles size={25}/></div>
        <h2>{question.prompt}</h2>
        <div className="bio-casefile"><div><span>Focus</span><strong>{scene.organ || "Body system"}</strong></div><div><span>Function</span><strong>{scene.vitalFocus || "coordination"}</strong></div><div><span>Strain</span><strong>{strainLevel}/5</strong></div></div>
        <div className="bio-protocol-label"><span>PROTOCOL RACK</span><small>Load one explanation, then route it on the body board</small></div>
        <div className="bio-options">{question.options.slice(0, 4).map((option, index) => <button type="button" key={`${index}-${option}`} className={selected === index ? "selected" : ""} onClick={() => chooseProtocol(index)} disabled={pulse}><b>{index + 1}</b><span>{option}</span><i>{selected === index ? "LOADED" : "standby"}</i></button>)}</div>
        {scanActive ? <div className="bio-scan"><ScanLine size={15}/><span>BioScan: {signals.length ? signals.join(" · ") : cue}</span></div> : null}
        <div className="bio-actions"><button type="button" className="bio-commit" onClick={commitCase} disabled={pulse || selected === null || !routeLocked}><Activity size={16}/>{pulse ? "Sealing response…" : !routeLocked ? "Route protocol first" : "Stabilise case"}</button><button type="button" className="bio-scan-button" onClick={scanCase} disabled={scans < 1 || pulse}><ScanLine size={16}/>BioScan · {scans}</button></div>
        <div className="bio-status" aria-live="polite"><span>{message}</span><small>1–4 load protocol · 5–8 route body · B scan · Enter stabilise</small></div>
      </div> : <div className="bioquest-console bio-finished"><Microscope size={48}/><strong>HUMAN SYSTEMS STABILISED · REVIEW READY</strong><span>Uploading sealed case choices for authoritative science grading…</span></div>}
      <div className="bio-strain"><span><Clock size={13}/> System strain</span><i><b style={{ width: `${strain}%` }}/></i><strong>{Math.round(strain)}%</strong></div>
    </div>

    <footer className="bioquest-footer"><span>Lab progress {progress}%</span><span>Bio Insight {insight} · chain x{Math.max(1, combo)}</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Biology profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
