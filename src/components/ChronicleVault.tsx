"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookMarked, Clock3, Hourglass, Landmark, LogOut, Search, ShieldCheck, Sparkles } from "lucide-react";
import {
  chronicleCaseDurationMs,
  chronicleChainGain,
  chronicleInsightReward,
  chronicleIntegrityReward,
  chronicleLensRecovery,
  chronicleParadoxDamage,
  chronicleRestoreOrder,
} from "@/lib/chronicle-vault";
import type { ChronicleScene } from "@/lib/chronicle-vault-content";
import "./chronicle-vault.css";

type Question = { id: string; kind?: string; prompt: string; options: string[]; scene?: unknown };
type Plan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type Round = { id: string; difficulty: number; answers: string[]; questions: Question[]; learningPlan?: Plan | null };
type Props = { learnerName: string; round: Round; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };

function firstOpen(answers: string[], length: number) {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
}

export default function ChronicleVault({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const commitRef = useRef<() => void>(() => undefined);
  const lensRef = useRef<() => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(firstOpen(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [order, setOrder] = useState<string[]>([]);
  const [pressure, setPressure] = useState(0);
  const [integrity, setIntegrity] = useState(84);
  const [insight, setInsight] = useState(5);
  const [lenses, setLenses] = useState(2);
  const [chain, setChain] = useState(0);
  const [lensOpen, setLensOpen] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [message, setMessage] = useState("The Chronicle Vault has detected damaged records. Restore the timeline with evidence, not guesswork.");

  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[checkpoint];
  const scene = (question?.scene ?? {}) as Partial<ChronicleScene>;
  const plan = round.learningPlan;
  const isSort = question?.kind === "sort_plus";
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const paradoxLevel = Math.max(1, Math.min(5, Number(scene.paradoxLevel ?? round.difficulty)));
  const clues = Array.isArray(scene.contextClues) ? scene.contextClues.slice(0, 3) : [];
  const duration = useMemo(
    () => chronicleCaseDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"),
    [round.difficulty, plan?.speedScale, plan?.supportMode],
  );
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);

  useEffect(() => {
    startedRef.current = Date.now();
    setPressure(0);
    setSelected(0);
    setLensOpen(false);
    setOrder(question ? chronicleRestoreOrder(answersRef.current[checkpoint] ?? "", question.options) : []);
    if (question) {
      setMessage(boss
        ? "FINAL PARADOX: seal the master record before archive integrity collapses."
        : `Record ${checkpoint + 1} opened in ${scene.archiveWing ?? "Chronicle Vault"}.`);
    }
  }, [boss, checkpoint, question, scene.archiveWing]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 420);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      if (elapsed >= duration) {
        const damage = chronicleParadoxDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setIntegrity((value) => Math.max(22, value - damage));
        setChain(0);
        startedRef.current = Date.now() - Math.round(duration * 0.48);
        setPressure(48);
        setMessage(`Paradox surge: archive integrity -${damage}. Re-check chronology and provenance.`);
      } else {
        setPressure(Math.min(100, (elapsed / duration) * 100));
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length]);

  const lens = () => {
    if (!question || lenses < 1 || sealing) return;
    setLenses((value) => Math.max(0, value - 1));
    setPressure((current) => {
      const next = chronicleLensRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setLensOpen(true);
    setMessage(`ChronoLens context: ${clues.length ? clues.join(" · ") : scene.cue ?? "Check era, provenance and cause."} It gives context, never the sealed answer.`);
  };
  lensRef.current = lens;

  const move = (index: number, delta: number) => setOrder((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const commit = () => {
    if (!question || sealing || completedRef.current) return;
    const answer = isSort ? JSON.stringify(order) : question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const integrityGain = chronicleIntegrityReward(pressure, round.difficulty);
    const insightGain = chronicleInsightReward(paradoxLevel, pressure);
    const chainGain = chronicleChainGain(pressure);
    setIntegrity((value) => Math.min(100, value + integrityGain));
    setInsight((value) => Math.min(999, value + insightGain));
    setChain((value) => Math.min(99, value + chainGain));
    if (pressure <= 42) setLenses((value) => Math.min(5, value + 1));
    setSealing(true);
    setMessage(`Record sealed for authoritative review. +${insightGain} insight · integrity +${integrityGain}${chainGain ? ` · chain +${chainGain}` : ""}.`);
    window.setTimeout(() => {
      setSealing(false);
      setCheckpoint((value) => value + 1);
    }, 600);
  };
  commitRef.current = commit;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key >= "1" && event.key <= "4" && !isSort) {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) setSelected(index);
      } else if (event.key.toLowerCase() === "l") {
        lensRef.current();
      } else if (event.key === "Enter") {
        event.preventDefault();
        commitRef.current();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return <section className="chronicle-shell" aria-label={`Chronicle Vault for ${learnerName}`}>
    <header className="chronicle-bar">
      <div className="chronicle-brand"><span><Hourglass size={22}/></span><div><strong>CHRONICLE VAULT</strong><small>history investigation · chronology · evidence reasoning</small></div></div>
      <button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>
    <div className="chronicle-hud">
      <div><ShieldCheck size={16}/><strong>{integrity}%</strong><span>archive integrity</span></div>
      <div><BookMarked size={16}/><strong>{insight}</strong><span>historian insight</span></div>
      <div><Sparkles size={16}/><strong>x{Math.max(1, chain)}</strong><span>evidence chain</span></div>
      <div><Search size={16}/><strong>{lenses}</strong><span>ChronoLens</span></div>
    </div>
    <div className="chronicle-stage">
      <aside className="chronicle-archive">
        <div className="chronicle-clock"><Hourglass size={46}/><span>{scene.era ?? "Historical archive"}</span></div>
        <div className="chronicle-rails">{["PAST", "TURNING POINT", "AFTERMATH"].map((label, index) => <div key={label}><i/><span>{label}</span><b>{index === 0 ? "origin" : index === 1 ? scene.artifact ?? "record" : "legacy"}</b></div>)}</div>
        <div className="chronicle-case"><small>{scene.caseId ?? `CV-${checkpoint + 1}`} · {scene.archiveWing ?? "Archive"}</small><strong>{scene.artifact ?? "Historical record"}</strong><span>{scene.evidenceTags?.join(" · ") ?? "chronology · evidence"}</span></div>
      </aside>
      {question ? <main className="chronicle-console">
        <div className="chronicle-heading"><div><span>{boss ? "MASTER RECORD · FINAL PARADOX" : `${String(scene.mission ?? "history").toUpperCase()} · RECORD ${checkpoint + 1}/${round.questions.length}`}</span><strong>{scene.cue ?? "Use evidence and chronology."}</strong></div><Landmark size={26}/></div>
        <h2>{question.prompt}</h2>
        {isSort ? <div className="chronicle-order">{order.map((item, index) => <div key={item}><b>{index + 1}</b><span>{item}</span><span className="chronicle-moves"><button type="button" onClick={() => move(index, -1)} disabled={index === 0 || sealing} aria-label={`Move ${item} earlier`}><ArrowUp size={15}/></button><button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1 || sealing} aria-label={`Move ${item} later`}><ArrowDown size={15}/></button></span></div>)}</div>
          : <div className="chronicle-options">{question.options.slice(0, 4).map((option, index) => <button type="button" key={option} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} disabled={sealing}><b>{index + 1}</b><span>{option}</span></button>)}</div>}
        {lensOpen ? <div className="chronicle-lens"><Search size={15}/><span>{clues.join(" · ")}</span></div> : null}
        <div className="chronicle-actions"><button type="button" className="chronicle-seal" onClick={commit} disabled={sealing}><BookMarked size={16}/>{sealing ? "Sealing record…" : "Seal archive record"}</button><button type="button" onClick={lens} disabled={lenses < 1 || sealing}><Search size={16}/>ChronoLens · {lenses}</button></div>
        <div className="chronicle-status" aria-live="polite"><span>{message}</span><small>{isSort ? "Use ↑ ↓ to rebuild the time rail" : "1–4 choose"} · L lens · Enter seal</small></div>
      </main> : <main className="chronicle-console chronicle-finished"><Hourglass size={52}/><strong>ARCHIVE STABLE · REVIEW READY</strong><span>Uploading sealed records for authoritative history grading…</span></main>}
      <div className="chronicle-pressure"><span><Clock3 size={13}/> Paradox pressure</span><i><b style={{ width: `${pressure}%` }}/></i><strong>{Math.round(pressure)}%</strong></div>
    </div>
    <footer className="chronicle-footer"><span>Vault restored {progress}%</span><span>{plan?.masteryPercent == null ? "History profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
