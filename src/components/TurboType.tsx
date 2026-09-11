"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Gauge, Keyboard, LogOut, Target, Zap } from "lucide-react";
import "./turbotype.css";

type TypingTroubleKey = { key: string; count: number };
export type TurboTypeTelemetry = {
  version: 1;
  final: boolean;
  elapsedMs: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  accuracy: number;
  wpm: number;
  troublesomeKeys: TypingTroubleKey[];
};

type TurboQuestion = { id: string; prompt: string; options: string[] };
type TurboLearningPlan = {
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type TurboRound = {
  id: string;
  difficulty: number;
  answers: string[];
  questions: TurboQuestion[];
  learningPlan?: TurboLearningPlan | null;
};

type Props = {
  learnerName: string;
  round: TurboRound;
  onComplete: (answers: string[], telemetry: TurboTypeTelemetry) => void;
  onExit: (answers: string[], telemetry: TurboTypeTelemetry) => void;
};

const WORLD_LABELS: Record<NonNullable<TurboRound["learningPlan"]>["worldKey"], string> = {
  "aurora-causeway": "Aurora Circuit",
  "meteor-foundry": "Meteor Speedway",
  "prism-canyon": "Prism Run",
  "nova-citadel": "Citadel Grand Prix",
};

function targetFromPrompt(prompt: string) {
  const marker = "Type this exactly: ";
  const index = prompt.lastIndexOf(marker);
  return index >= 0 ? prompt.slice(index + marker.length) : prompt;
}

function prefixLength(value: string, target: string) {
  let index = 0;
  while (index < value.length && index < target.length && value[index] === target[index]) index += 1;
  return index;
}

function displayKey(value: string) {
  if (value === " ") return "Space";
  return value;
}

export default function TurboType({ learnerName, round, onComplete, onExit }: Props) {
  const targets = useMemo(() => round.questions.map((question) => targetFromPrompt(question.prompt)), [round.questions]);
  const initialIndex = useMemo(() => {
    const first = round.answers.findIndex((answer) => !answer.trim());
    return first < 0 ? round.questions.length : first;
  }, [round.answers, round.questions.length]);
  const [checkpoint, setCheckpoint] = useState(initialIndex);
  const [typed, setTyped] = useState("");
  const [clock, setClock] = useState(0);
  const [flash, setFlash] = useState<"" | "good" | "bad">("");
  const inputRef = useRef<HTMLInputElement>(null);
  const answersRef = useRef([...round.answers]);
  const startRef = useRef(Date.now());
  const totalRef = useRef(0);
  const correctRef = useRef(0);
  const troubleRef = useRef(new Map<string, number>());
  const finishingRef = useRef(false);
  const completedRef = useRef(false);
  const completeHandlerRef = useRef(onComplete);
  const exitHandlerRef = useRef(onExit);
  completeHandlerRef.current = onComplete;
  exitHandlerRef.current = onExit;

  const target = targets[checkpoint] ?? "";
  const totalCharacters = Math.max(1, targets.reduce((sum, item) => sum + item.length, 0));
  const completedCharacters = answersRef.current.reduce((sum, answer) => sum + answer.length, 0);
  const currentCorrect = prefixLength(typed, target);
  const progress = Math.min(100, Math.round(((completedCharacters + currentCorrect) / totalCharacters) * 100));
  const elapsedMs = Math.max(0, Date.now() - startRef.current);
  const elapsedMinutes = Math.max(elapsedMs / 60000, 1 / 60);
  const wpm = Math.round(((correctRef.current / 5) / elapsedMinutes) * 10) / 10;
  const accuracy = totalRef.current ? Math.round((correctRef.current / totalRef.current) * 1000) / 10 : 100;
  const rivalRate = (1.25 + round.difficulty * 0.22) * (round.learningPlan?.speedScale ?? 1);
  const rivalProgress = Math.min(96, Math.round(((clock / 1000) * rivalRate / totalCharacters) * 100));
  const worldLabel = round.learningPlan ? WORLD_LABELS[round.learningPlan.worldKey] : "Nova Circuit";
  const supportLabel = round.learningPlan?.supportMode ?? "adaptive";

  const telemetry = (final: boolean): TurboTypeTelemetry => {
    const elapsed = Math.max(0, Date.now() - startRef.current);
    const minutes = Math.max(elapsed / 60000, 1 / 60);
    const currentAccuracy = totalRef.current ? Math.round((correctRef.current / totalRef.current) * 1000) / 10 : 0;
    const currentWpm = Math.min(300, Math.round(((correctRef.current / 5) / minutes) * 10) / 10);
    return {
      version: 1,
      final,
      elapsedMs: Math.min(3600000, elapsed),
      totalKeystrokes: totalRef.current,
      correctKeystrokes: correctRef.current,
      accuracy: currentAccuracy,
      wpm: currentWpm,
      troublesomeKeys: [...troubleRef.current.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([key, count]) => ({ key, count })),
    };
  };

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now() - startRef.current), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (checkpoint < round.questions.length) window.setTimeout(() => inputRef.current?.focus(), 60);
    else if (!completedRef.current) {
      completedRef.current = true;
      window.setTimeout(() => completeHandlerRef.current([...answersRef.current], telemetry(true)), 250);
    }
  // telemetry intentionally reads refs at completion time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoint, round.questions.length]);

  const registerKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const cursor = event.currentTarget.selectionStart ?? typed.length;
    const expected = target[cursor] ?? "";
    totalRef.current += 1;
    if (event.key === expected) {
      correctRef.current += 1;
      setFlash("good");
    } else {
      if (expected) troubleRef.current.set(expected, Math.min(999, (troubleRef.current.get(expected) ?? 0) + 1));
      setFlash("bad");
    }
    window.setTimeout(() => setFlash(""), 110);
  };

  const changeTyped = (nextValue: string) => {
    if (finishingRef.current) return;
    const bounded = nextValue.slice(0, target.length);
    setTyped(bounded);
    if (bounded !== target) return;
    finishingRef.current = true;
    answersRef.current[checkpoint] = target;
    setFlash("good");
    window.setTimeout(() => {
      setTyped("");
      setFlash("");
      finishingRef.current = false;
      setCheckpoint((value) => value + 1);
    }, 320);
  };

  const exit = () => {
    if (completedRef.current) return;
    exitHandlerRef.current([...answersRef.current], telemetry(false));
  };

  const topTrouble = [...troubleRef.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return <section className="turbo-shell" aria-label={`TurboType race for ${learnerName}`}>
    <header className="turbo-bar">
      <div className="turbo-brand"><span>TT</span><div><strong>TURBOTYPE</strong><small>{worldLabel} · {supportLabel} mission</small></div></div>
      <button type="button" className="turbo-exit" onClick={exit}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="turbo-hud">
      <div><Gauge size={16}/><strong>{Number.isFinite(wpm) ? wpm : 0}</strong><span>WPM</span></div>
      <div><Target size={16}/><strong>{accuracy}%</strong><span>accuracy</span></div>
      <div><Zap size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>checkpoints</span></div>
      <div><Keyboard size={16}/><strong>LV {round.difficulty}</strong><span>typing lane</span></div>
    </div>

    <div className={`turbo-arena ${flash}`}>
      <div className="turbo-sky"><span>{worldLabel.toUpperCase()}</span><b>{round.learningPlan?.bossGate && checkpoint === round.questions.length - 1 ? "FINAL BOSS SPRINT" : "PRECISION RACE"}</b></div>
      <div className="turbo-track" aria-label={`Race progress ${progress}%`}>
        <div className="turbo-lane player"><span className="turbo-racer" style={{ left: `calc(${Math.min(94, progress)}% - 23px)` }}>TT</span><i style={{ width: `${progress}%` }}/></div>
        <div className="turbo-lane rival"><span className="turbo-racer" style={{ left: `calc(${rivalProgress}% - 23px)` }}>⚡</span><i style={{ width: `${rivalProgress}%` }}/></div>
        <Flag className="turbo-flag" size={26}/>
      </div>

      {checkpoint < round.questions.length ? <div className="turbo-console">
        <div className="turbo-console-head"><span>CHECKPOINT {checkpoint + 1} / {round.questions.length}</span><small>{round.learningPlan?.hintStrength ? "Accuracy first — correct mistakes before accelerating." : "Stay precise. Every character moves your racer."}</small></div>
        <div className="turbo-target" aria-label={`Target text: ${target}`}>{Array.from(target).map((character, index) => {
          const typedCharacter = typed[index];
          const state = typedCharacter === undefined ? (index === typed.length ? "next" : "") : typedCharacter === character ? "hit" : "miss";
          return <span key={`${index}-${character}`} className={state}>{character === " " ? "·" : character}</span>;
        })}</div>
        <label className="turbo-input-wrap">
          <span>TYPE HERE</span>
          <input
            ref={inputRef}
            value={typed}
            onKeyDown={registerKey}
            onChange={(event) => changeTyped(event.target.value)}
            onPaste={(event) => event.preventDefault()}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Type the displayed target exactly"
          />
        </label>
        <div className="turbo-key-help">
          <span><b>Spaces</b> appear as · in the target.</span>
          {topTrouble.length ? <span>Practice focus: {topTrouble.map(([key]) => displayKey(key)).join(" · ")}</span> : <span>Build rhythm without sacrificing accuracy.</span>}
        </div>
      </div> : <div className="turbo-console turbo-complete"><Flag size={34}/><strong>FINISH LINE!</strong><span>Saving your race and typing progress…</span></div>}
    </div>

    <footer className="turbo-footer"><span>Paste is disabled for fair typing practice.</span><span>{progress}% course complete</span></footer>
  </section>;
}
