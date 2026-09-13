"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bus, ClipboardCheck, Clock, CloudRain, Droplets, Leaf, Link2, LogOut, MapPin, Recycle, RotateCcw, ScanLine, Sprout, Trash2, TreePine, Zap } from "lucide-react";
import { ecoChainGain, ecoEventDurationMs, ecoResourceGain, ecoResilienceReward, ecoSeedReward, ecoStressDamage, ecoSurveyRecovery } from "@/lib/ecogrid";
import type { EcoGridMission, EcoGridScene } from "@/lib/ecogrid-content";
import "./ecogrid-ghana.css";

type EcoQuestion = { id: string; prompt: string; options: string[]; scene?: unknown };
type EcoPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type EcoRound = { id: string; difficulty: number; answers: string[]; questions: EcoQuestion[]; learningPlan?: EcoPlan | null };
type Props = { learnerName: string; round: EcoRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };

const missionLabels: Record<EcoGridMission, string> = {
  waste: "WASTE FLOW",
  water: "WATER SECURITY",
  sanitation: "CLEAN COMMUNITY",
  energy: "ENERGY SMART",
  habitat: "HABITAT RESTORE",
  climate: "CLIMATE READY",
  transport: "CLEAN MOBILITY",
  ewaste: "E-WASTE CONTROL",
  circularity: "CIRCULAR CITY",
};

const missionIcons: Record<EcoGridMission, typeof Leaf> = {
  waste: Trash2,
  water: Droplets,
  sanitation: Recycle,
  energy: Zap,
  habitat: TreePine,
  climate: CloudRain,
  transport: Bus,
  ewaste: Recycle,
  circularity: Sprout,
};

const evidenceKeys = ["A", "B", "C"] as const;

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function EcoGridGhana({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const commitRef = useRef<() => void>(() => undefined);
  const surveyRef = useRef<() => void>(() => undefined);
  const stageRef = useRef<(index: number) => void>(() => undefined);
  const linkRef = useRef<(index: number) => void>(() => undefined);
  const resetRef = useRef<() => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [selected, setSelected] = useState<number | null>(null);
  const [linkedSignals, setLinkedSignals] = useState<number[]>([]);
  const [ecoStress, setEcoStress] = useState(0);
  const [resilience, setResilience] = useState(78);
  const [water, setWater] = useState(68);
  const [power, setPower] = useState(66);
  const [habitat, setHabitat] = useState(64);
  const [seeds, setSeeds] = useState(8);
  const [surveys, setSurveys] = useState(2);
  const [chain, setChain] = useState(0);
  const [surveyActive, setSurveyActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("EcoGrid is online. Stage a community project, connect the field evidence, then deploy the blueprint.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const scene = (question?.scene ?? {}) as Partial<EcoGridScene>;
  const mission = (scene.ecoMission ?? "waste") as EcoGridMission;
  const MissionIcon = missionIcons[mission];
  const riskLevel = Math.max(1, Math.min(5, Number(scene.riskLevel ?? round.difficulty)));
  const signals = Array.isArray(scene.ecoSignals) ? scene.ecoSignals.slice(0, 3) : [];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(
    () => ecoEventDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"),
    [plan?.speedScale, plan?.supportMode, round.difficulty],
  );
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const cue = scene.cue || "Trace the environmental cause, who or what is affected, and which action prevents the problem at its source.";
  const requiredLinks = signals.length;
  const blueprintReady = selected !== null && linkedSignals.length >= requiredLinks;

  useEffect(() => {
    startedRef.current = Date.now();
    setEcoStress(0);
    setSelected(null);
    setLinkedSignals([]);
    setSurveyActive(false);
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "FINAL RESTORATION SUMMIT: stage the final proposal and connect every field signal before deployment." : `Project ${checkpoint + 1} is live in ${scene.zone || "the community"}. Choose a proposal, then build an evidence-backed blueprint.`);
    }
  }, [boss, checkpoint, round.questions.length, scene.zone]);

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
        const damage = ecoStressDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setResilience((value) => Math.max(22, value - damage));
        if (mission === "water" || mission === "sanitation") setWater((value) => Math.max(25, value - Math.ceil(damage / 2)));
        if (mission === "energy" || mission === "transport") setPower((value) => Math.max(25, value - Math.ceil(damage / 2)));
        if (mission === "habitat" || mission === "climate") setHabitat((value) => Math.max(25, value - Math.ceil(damage / 2)));
        setChain(0);
        startedRef.current = Date.now() - Math.round(duration * 0.5);
        setEcoStress(50);
        setMessage(`Environmental stress rose. Community resilience absorbed ${damage}% impact — complete the evidence blueprint before deploying.`);
      } else {
        setEcoStress(Math.min(100, (elapsed / duration) * 100));
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, mission, plan?.hazardDensity, round.questions.length]);

  const fieldSurvey = () => {
    if (!question || surveys < 1 || pulse) return;
    setSurveys((value) => Math.max(0, value - 1));
    setEcoStress((current) => {
      const next = ecoSurveyRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setSurveyActive(true);
    const evidence = signals.length ? signals.join(" · ") : cue;
    setMessage(`Field survey: ${evidence}. Use those observations to judge the proposal you stage; the survey never identifies the graded action.`);
  };
  surveyRef.current = fieldSurvey;

  const stageProposal = (index: number) => {
    if (!question || pulse || index < 0 || index >= question.options.length) return;
    setSelected(index);
    setLinkedSignals([]);
    setMessage(`Proposal ${index + 1} staged on the planning table. Link ${requiredLinks || "the available"} field evidence signal${requiredLinks === 1 ? "" : "s"} before deployment.`);
  };
  stageRef.current = stageProposal;

  const linkEvidence = (index: number) => {
    if (!question || pulse || index < 0 || index >= signals.length) return;
    if (selected === null) {
      setMessage("Stage a community proposal first. Evidence must be connected to a specific project blueprint.");
      return;
    }
    setLinkedSignals((current) => current.includes(index) ? current : [...current, index]);
    setMessage(`Field signal ${index + 1} linked: ${signals[index]}. ${Math.min(requiredLinks, linkedSignals.length + (linkedSignals.includes(index) ? 0 : 1))}/${requiredLinks} evidence links secured.`);
  };
  linkRef.current = linkEvidence;

  const resetBlueprint = () => {
    if (pulse) return;
    setSelected(null);
    setLinkedSignals([]);
    setMessage("Blueprint cleared. Review the environmental event and stage a new proposal.");
  };
  resetRef.current = resetBlueprint;

  const commitProject = () => {
    if (!question || selected === null || !blueprintReady || pulse || completedRef.current) {
      if (question && !pulse && !blueprintReady) setMessage("The blueprint is incomplete. Stage one proposal and link every field signal before deployment.");
      return;
    }
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const resilienceGain = ecoResilienceReward(ecoStress, round.difficulty);
    const seedGain = ecoSeedReward(riskLevel, ecoStress);
    const resourceGain = ecoResourceGain(riskLevel, ecoStress);
    const chainGain = ecoChainGain(ecoStress);
    setResilience((value) => Math.min(100, value + resilienceGain));
    setSeeds((value) => Math.min(999, value + seedGain));
    setChain((value) => Math.min(99, value + chainGain));
    if (mission === "water" || mission === "sanitation" || mission === "waste") setWater((value) => Math.min(100, value + resourceGain));
    if (mission === "energy" || mission === "transport" || mission === "ewaste") setPower((value) => Math.min(100, value + resourceGain));
    if (mission === "habitat" || mission === "climate" || mission === "circularity") setHabitat((value) => Math.min(100, value + resourceGain));
    if (ecoStress <= 42) setSurveys((value) => Math.min(5, value + 1));
    setPulse(true);
    setMessage(`Evidence-backed project sealed for secure review. +${seedGain} Eco Seeds · resilience +${resilienceGain} · ${chainGain ? `restoration chain +${chainGain}` : "district stabilised"}.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 620);
  };
  commitRef.current = commitProject;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) stageRef.current(index);
      } else if (key === "a") linkRef.current(0);
      else if (key === "b") linkRef.current(1);
      else if (key === "c") linkRef.current(2);
      else if (key === "f") surveyRef.current();
      else if (key === "r") resetRef.current();
      else if (event.key === "Enter") {
        event.preventDefault();
        commitRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const stressMarkers = Math.max(1, Math.min(5, 1 + Math.floor(ecoStress / 22)));

  return <section className="ecogrid-shell" aria-label={`EcoGrid Ghana for ${learnerName}`}>
    <header className="ecogrid-bar">
      <div className="ecogrid-brand"><span><Leaf size={22}/></span><div><strong>ECOGRID GHANA</strong><small>adaptive environmental strategy · community planning · systems thinking</small></div></div>
      <button type="button" className="ecogrid-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="ecogrid-hud">
      <div><Leaf size={16}/><strong>{resilience}%</strong><span>resilience</span></div>
      <div><Droplets size={16}/><strong>{water}%</strong><span>water</span></div>
      <div><Zap size={16}/><strong>{power}%</strong><span>green power</span></div>
      <div><TreePine size={16}/><strong>{habitat}%</strong><span>habitat</span></div>
    </div>

    <div className={`ecogrid-stage ${pulse ? "pulse" : ""}`}>
      <div className="ecogrid-world">
        <div className="ecogrid-sky">{Array.from({ length: stressMarkers }, (_, index) => <CloudRain key={index} size={18 + index * 2}/>)}</div>
        <div className="ecogrid-map-title"><MapPin size={18}/><div><strong>{scene.zone || "Community Grid"}</strong><span>{scene.forecast || "Live environmental forecast"}</span></div></div>
        <div className="eco-road road-one"/><div className="eco-road road-two"/>
        <div className="eco-zone eco-river"><Droplets size={23}/><strong>RIVER WARD</strong><span>water + drainage</span></div>
        <div className="eco-zone eco-market"><Recycle size={23}/><strong>MARKET LOOP</strong><span>materials + waste</span></div>
        <div className="eco-zone eco-school"><Zap size={23}/><strong>SCHOOL QUARTER</strong><span>energy + habits</span></div>
        <div className="eco-zone eco-green"><TreePine size={23}/><strong>GREEN BELT</strong><span>habitat + shade</span></div>
        <div className={`eco-blueprint-beacon ${blueprintReady ? "ready" : ""}`}><ClipboardCheck size={22}/><div><small>PLANNING TABLE</small><strong>{selected === null ? "NO PROJECT STAGED" : `PROPOSAL ${selected + 1}`}</strong><span>{linkedSignals.length}/{requiredLinks} evidence links</span></div></div>
        <div className="eco-ranger"><div>{learnerName.trim()?.[0]?.toUpperCase() || "E"}</div><strong>ECO PLANNER</strong></div>
        <div className="eco-project-id"><small>RESTORATION PROJECT</small><strong>{scene.projectId || `ECO-${checkpoint + 1}`}</strong><span>{scene.event || "Community event"}</span></div>
      </div>

      {question ? <div className="ecogrid-console">
        <div className="eco-console-head"><div><span>{boss ? "FINAL PROJECT · RESTORATION SUMMIT" : `${missionLabels[mission]} · PROJECT ${checkpoint + 1}/${round.questions.length}`}</span><strong>{cue}</strong></div><MissionIcon size={25}/></div>
        <h2>{question.prompt}</h2>
        <div className="eco-casefile"><div><span>Zone</span><strong>{scene.zone || "Community"}</strong></div><div><span>Resource</span><strong>{scene.resource || "Resilience"}</strong></div><div><span>Risk</span><strong>{riskLevel}/5</strong></div></div>

        <div className="eco-planner">
          <div className="eco-planner-title"><div><span>PROJECT BLUEPRINTS</span><strong>Stage one proposal</strong></div><b>{selected === null ? "0/1" : "1/1"}</b></div>
          <div className="eco-proposals">{question.options.slice(0, 4).map((option, index) => <button type="button" key={`${index}-${option}`} className={selected === index ? "staged" : ""} onClick={() => stageProposal(index)} disabled={pulse}><b>{index + 1}</b><span>{option}</span><small>{selected === index ? "STAGED" : "PROPOSAL"}</small></button>)}</div>
          <div className={`eco-evidence-board ${selected !== null ? "active" : ""}`}>
            <div className="eco-evidence-head"><Link2 size={15}/><div><span>FIELD EVIDENCE LINKS</span><strong>{selected === null ? "Stage a proposal to begin" : `Connect observations to proposal ${selected + 1}`}</strong></div><b>{linkedSignals.length}/{requiredLinks}</b></div>
            <div className="eco-signals">{signals.length ? signals.map((signal, index) => <button type="button" key={`${signal}-${index}`} className={linkedSignals.includes(index) ? "linked" : ""} onClick={() => linkEvidence(index)} disabled={pulse || selected === null} aria-pressed={linkedSignals.includes(index)}><b>{evidenceKeys[index] ?? index + 1}</b><span>{signal}</span><small>{linkedSignals.includes(index) ? "LINKED" : "CONNECT"}</small></button>) : <div className="eco-no-signals"><Leaf size={15}/><span>No extra field signals are required for this project.</span></div>}</div>
          </div>
        </div>

        {surveyActive ? <div className="eco-survey"><ScanLine size={15}/><span>Field evidence: {signals.length ? signals.join(" · ") : cue}</span></div> : null}
        <div className="eco-actions"><button type="button" className="eco-commit" onClick={commitProject} disabled={pulse || !blueprintReady}><Leaf size={16}/>{pulse ? "Deploying project…" : blueprintReady ? "Deploy blueprint" : "Complete blueprint"}</button><button type="button" className="eco-reset-button" onClick={resetBlueprint} disabled={pulse || (selected === null && linkedSignals.length === 0)}><RotateCcw size={16}/>Clear</button><button type="button" className="eco-survey-button" onClick={fieldSurvey} disabled={surveys < 1 || pulse}><ScanLine size={16}/>Survey · {surveys}</button></div>
        <div className="eco-status" aria-live="polite"><span>{message}</span><small>1–4 stage · A/B/C link evidence · F survey · R reset · Enter deploy</small></div>
      </div> : <div className="ecogrid-console eco-finished"><Sprout size={48}/><strong>COMMUNITY RESTORED · REVIEW READY</strong><span>Uploading sealed project choices for authoritative environmental-learning grading…</span></div>}

      <div className="eco-stress"><span><Clock size={13}/> Eco stress</span><i><b style={{ width: `${ecoStress}%` }}/></i><strong>{Math.round(ecoStress)}%</strong></div>
    </div>

    <footer className="ecogrid-footer"><span>Restoration progress {progress}%</span><span>Eco Seeds {seeds} · chain x{Math.max(1, chain)}</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Eco profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
